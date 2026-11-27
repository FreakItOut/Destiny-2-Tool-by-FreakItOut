// ============================================================
// Gamepad-Hilfsprogramm (XInput)
// ============================================================
// Liest den Controller direkt über die Windows-XInput-Schnittstelle
// und schreibt den Zustand als kompakte Zeilen auf stdout.
//
// Warum? Chromium liefert Gamepad-Eingaben nur an das Fenster, das
// gerade den Fokus hat. Für ein Overlay über dem Spiel ist das nicht
// brauchbar. Dieser Helfer läuft als eigener Prozess und ist daher
// völlig unabhängig vom Fensterfokus.
//
// Protokoll (eine Zeile pro Änderung):
//   S <index> <connected 0|1> <buttonMask> <ltrigger> <rtrigger> <lx> <ly> <rx> <ry>
//   R <index> <strength> <durationMs>   (Vibration)
//   V <version>
//
// Werte: Trigger 0..1, Achsen -1..1, buttonMask ist eine Bitmaske in
// Gamepad-API-Reihenfolge (Bit 0 = A, Bit 1 = B, ... Bit 16 = Guide).
// ============================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class GamepadHelper
{
    // ------------------------------------------------------------
    // Win32/XInput
    // ------------------------------------------------------------
    // Offizielle XINPUT_GAMEPAD-Belegung (xinput.h) mit natürlicher
    // Ausrichtung, wie sie der C-Compiler erzeugt:
    //
    //   WORD  wButtons;       // Offset 0-1
    //   BYTE  bLeftTrigger;   // Offset 2
    //   BYTE  bRightTrigger;  // Offset 3
    //   SHORT sThumbLX;       // Offset 4-5
    //   SHORT sThumbLY;       // Offset 6-7
    //   SHORT sThumbRX;       // Offset 8-9
    //   SHORT sThumbRY;       // Offset 10-11
    //   -> Strukturgröße 12 Byte
    //
    // Achtung: BYTE folgt direkt auf WORD (Offset 2, nicht 4!), und
    // die SHORT-Werte beginnen bei Offset 4. Wer die Trigger auf 4/5
    // legt, liest die Bytes des linken Sticks - genau das führte zu
    // "L2/R2 lösen beim Bewegen des Sticks aus".
    [StructLayout(LayoutKind.Explicit, Size = 12)]
    private struct XInputGamepad
    {
        [FieldOffset(0)] public ushort Buttons;
        [FieldOffset(2)] public byte LeftTrigger;
        [FieldOffset(3)] public byte RightTrigger;
        [FieldOffset(4)] public short ThumbLX;
        [FieldOffset(6)] public short ThumbLY;
        [FieldOffset(8)] public short ThumbRX;
        [FieldOffset(10)] public short ThumbRY;
    }

    // XINPUT_STATE: DWORD Paketnummer (Offset 0) + Gamepad (Offset 4)
    // -> Strukturgröße 16 Byte.
    [StructLayout(LayoutKind.Explicit, Size = 16)]
    private struct XInputState
    {
        [FieldOffset(0)] public uint PacketNumber;
        [FieldOffset(4)] public XInputGamepad Gamepad;
    }

    [StructLayout(LayoutKind.Explicit, Size = 2)]
    private struct XInputBatteryInformation
    {
        [FieldOffset(0)] public byte BatteryType;
        [FieldOffset(1)] public byte BatteryLevel;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetBatteryInformation")]
    private static extern uint XInputGetBatteryInformation(uint userIndex, byte devType, ref XInputBatteryInformation batteryInformation);

    private const byte BatteryDeviceTypeGamepad = 0;

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern uint XInputGetState(uint userIndex, ref XInputState state);

    // XInputGetStateEx (Ordinal 100, undokumentiert): liefert dieselbe
    // Struktur, aber mit dem Guide-/Xbox-Knopf als Bit 0x0400 in
    // wButtons. Genau so liest auch Windows die Taste für die Game Bar.
    // Nicht in jeder XInput-DLL vorhanden - deshalb zwei Kandidaten und
    // ein Rückfall auf die normale Funktion.
    [DllImport("xinput1_4.dll", EntryPoint = "#100", SetLastError = true)]
    private static extern uint XInputGetStateEx14(uint userIndex, ref XInputState state);

    [DllImport("xinput1_3.dll", EntryPoint = "#100", SetLastError = true)]
    private static extern uint XInputGetStateEx13(uint userIndex, ref XInputState state);

    private delegate uint GetStateDelegate(uint userIndex, ref XInputState state);

    private static GetStateDelegate ActiveGetState;

    /// <summary>
    /// Läuft XInputGetStateEx (Guide-Knopf als Bit 0x0400)? Öffentlich,
    /// damit der Raw-Input-Teil die Guide-Verfügbarkeit korrekt melden
    /// kann (primärer Weg + Zusatzweg).
    /// </summary>
    public static bool StateExAvailable;

    /// <summary>
    /// Bestimmt die beste verfügbare XInput-Abfrage: XInputGetStateEx
    /// (mit Guide-Knopf) wenn möglich, sonst die normale Funktion.
    /// </summary>
    private static void InitXInput()
    {
        // Probeaufruf: fehlt der Einstiegspunkt oder die DLL, wird die
        // nächste Variante probiert. Ein fehlerhafter Geräteindex (1167)
        // ist in Ordnung - wichtig ist nur, dass der Aufruf möglich ist.
        try
        {
            XInputState probe = new XInputState();
            XInputGetStateEx14(0, ref probe);
            ActiveGetState = XInputGetStateEx14;
            StateExAvailable = true;
            return;
        }
        catch (Exception) { }
        try
        {
            XInputState probe = new XInputState();
            XInputGetStateEx13(0, ref probe);
            ActiveGetState = XInputGetStateEx13;
            StateExAvailable = true;
            return;
        }
        catch (Exception) { }
        ActiveGetState = XInputGetState;
        StateExAvailable = false;
    }

    // XInputSetVibration gibt es in xinput1_4.dll (Windows 8+) und
    // xinput1_3.dll (DirectX SDK). Beide werden probiert - fehlt ein
    // Einstiegspunkt, darf das Programm nicht beendet werden.
    [DllImport("xinput1_4.dll", EntryPoint = "XInputSetVibration", SetLastError = true)]
    private static extern uint XInputSetVibration14(uint userIndex, ref XInputVibration vibration);

    [DllImport("xinput1_3.dll", EntryPoint = "XInputSetVibration", SetLastError = true)]
    private static extern uint XInputSetVibration13(uint userIndex, ref XInputVibration vibration);

    // ------------------------------------------------------------
    // Echte Maus-Eingaben
    // ------------------------------------------------------------
    // HTML5-Drag-and-Drop lässt sich über CDP nicht auslösen: Chromium
    // startet den Drag erst bei einer echten OS-Bewegung. Deshalb
    // setzt das Tool den echten Mauszeiger und drückt die echte
    // Taste - damit funktionieren Klick, Drag und Drop überall.

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;

    /// <summary>
    /// Führt einen Maus-Befehl aus: move, down, up oder wheel.
    /// Koordinaten sind physische Bildschirmpixel.
    /// </summary>
    private static void NativeMouse(string action, int x, int y, int delta)
    {
        try
        {
            if (action == "down" || action == "up")
            {
                Console.Error.WriteLine("[maus] " + action + " " + x + " " + y);
            }
            if (action == "move")
            {
                SetCursorPos(x, y);
            }
            else if (action == "down")
            {
                SetCursorPos(x, y);
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            }
            else if (action == "up")
            {
                SetCursorPos(x, y);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
            else if (action == "wheel")
            {
                SetCursorPos(x, y);
                mouse_event(MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Maus fehlgeschlagen: " + error.Message);
        }
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetCapabilities")]
    private static extern uint XInputGetCapabilities(uint userIndex, uint flags, ref XInputCapabilities capabilities);

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputVibration
    {
        public ushort LeftMotorSpeed;
        public ushort RightMotorSpeed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct XInputCapabilities
    {
        public byte Type;
        public byte SubType;
        public ushort Flags;
        public XInputGamepad Gamepad;
        public XInputVibration Vibration;
    }

    private const uint ErrorSuccess = 0;
    private const uint ErrorDeviceNotConnected = 1167;
    private const uint CapsFlagVibration = 0x00000001;

    // ------------------------------------------------------------
    // Zustand
    // ------------------------------------------------------------
    private class Pad
    {
        public bool Connected;
        public bool Reported;
        public uint Buttons;
        public float LeftTrigger;
        public float RightTrigger;
        public float LX;
        public float LY;
        public float RX;
        public float RY;
        public byte BatteryLevel = 255; // 255 = unbekannt
        public DateTime LastBatteryAt = DateTime.MinValue;

        // Filterzustand je Achse (0 = X links, 1 = Y links,
        // 2 = X rechts, 3 = Y rechts).
        public float[] Smoothed = new float[4];
        public float[] Candidate = new float[4];
        public int[] CandidateCount = new int[4];
    }

    // Werte unterhalb dieser Grenze gelten als "Stick los".
    private const float IdleThreshold = 0.14f;
    // So viele Messungen muss ein Wert stabil bleiben, bevor er
    // übernommen wird (filtert Ausreißer).
    private const int StableSamples = 3;
    // Glättung: neuer Wert = alter Wert * Faktor + Rohwert * (1 - Faktor)
    private const float SmoothFactor = 0.55f;

    // Stärke des Filters: 0 = aus, 1 = normal, 2 = stark.
    private static int FilterLevel = 1;

    // Rohwerte der Achsen ausgeben (Diagnose).
    public static bool RawDiagnostics;

    // Defekte Achsen automatisch erkennen und abschalten.
    public static bool DetectBrokenAxis;


    // ------------------------------------------------------------
    // Achsen-Überwachung
    // ------------------------------------------------------------
    // Manche Controller haben eine defekte Achse (Potentiometer
    // ausgelagen). Diese liefert dann bei jeder Bewegung zufällige
    // Werte über den gesamten Bereich. Solche Achsen werden
    // erkannt und stillgelegt, damit der Cursor nicht wild springt.

    private class AxisWatch
    {
        public bool Suspect;
        public int SignFlips;
        public int PrevSign;
        public int WindowIndex;
        public int WindowCount;
        public int WindowFlips;
        public double Deviation;
        public readonly float[] Window = new float[48];
    }

    private static readonly AxisWatch[] Watch = new AxisWatch[4];

    private static void InitWatch()
    {
        for (int i = 0; i < Watch.Length; i += 1) Watch[i] = new AxisWatch();
    }

    /// <summary>
    /// Beobachtet eine Achse. Eine gesunde Achse bewegt sich
    /// stetig; eine defekte springt ständig zwischen großen Werten
    /// hin und her. Das erkennt man an der Streuung der Werte.
    ///
    /// Die Bewertung läuft fortlaufend über ein gleitendes Fenster,
    /// damit einzelne ruhige Phasen die Erkennung nicht verhindern.
    /// </summary>
    private static void TrackAxis(int axis, float raw)
    {
        AxisWatch watch = Watch[axis];
        if (Math.Abs(raw) < 0.30f) return;

        // Gleitendes Fenster über die letzten Werte.
        watch.Window[watch.WindowIndex] = raw;
        watch.WindowIndex = (watch.WindowIndex + 1) % watch.Window.Length;
        if (watch.WindowCount < watch.Window.Length) watch.WindowCount++;
        int sign = raw > 0 ? 1 : -1;
        if (watch.PrevSign != 0 && sign != watch.PrevSign) watch.SignFlips++;
        watch.PrevSign = sign;

        if (watch.Suspect || watch.WindowCount < watch.Window.Length) return;

        // Streuung und Richtungswechsel im Fenster auswerten.
        double sum = 0, sumSquares = 0;
        int flips = 0, last = 0;
        foreach (float value in watch.Window)
        {
            sum += value;
            sumSquares += (double)value * value;
            int valueSign = value > 0 ? 1 : -1;
            if (last != 0 && valueSign != last) flips++;
            last = valueSign;
        }
        double avg = sum / watch.Window.Length;
        double variance = sumSquares / watch.Window.Length - avg * avg;
        if (variance < 0) variance = 0;
        double deviation = Math.Sqrt(variance);
        watch.Deviation = deviation;
        watch.WindowFlips = flips;

        // Defekt, wenn die Werte stark streuen UND die Richtung
        // häufig wechselt.
        bool scattered = deviation > 0.35;
        bool flippy = flips * 2 > watch.Window.Length;
        if (scattered && flippy)
        {
            watch.Suspect = true;
            Console.WriteLine("W " + axis + " verrauscht");
            Console.Out.Flush();
        }
    }

    private static bool AxisIsNoisy(int axis)
    {
        return Watch[axis] != null && Watch[axis].Suspect;
    }

    /// <summary>
    /// Filtert einen Achsenwert: Ruhezone, Stabilitätsprüfung und
    /// Glättung.
    /// </summary>
    private static float Filter(Pad pad, int axis, float raw)
    {
        if (FilterLevel <= 0) return raw;

        TrackAxis(axis, raw);

        // Als defekt erkannte Achse wird stillgelegt (nur wenn die
        // Erkennung eingeschaltet ist).
        if (DetectBrokenAxis && AxisIsNoisy(axis)) return 0f;

        // Ruhezone: zurück auf 0.
        float idle = FilterLevel >= 2 ? IdleThreshold * 1.4f : IdleThreshold;
        int stable = FilterLevel >= 2 ? StableSamples + 2 : StableSamples;
        float smooth = FilterLevel >= 2 ? 0.72f : SmoothFactor;

        if (Math.Abs(raw) < idle) raw = 0f;

        float current = pad.Smoothed[axis];

        // Wert muss mehrere Messungen stabil bleiben.
        if (Math.Abs(raw - pad.Candidate[axis]) < 0.02f)
        {
            if (pad.CandidateCount[axis] < stable) pad.CandidateCount[axis]++;
        }
        else
        {
            pad.Candidate[axis] = raw;
            pad.CandidateCount[axis] = 1;
        }

        if (pad.CandidateCount[axis] >= stable)
        {
            current = current * smooth + pad.Candidate[axis] * (1f - smooth);
            if (Math.Abs(current) < idle) current = 0f;
            pad.Smoothed[axis] = current;
        }
        else if (raw == 0f && current != 0f)
        {
            // Zurück auf 0: sofort übernehmen, sonst klebt der Cursor.
            current = 0f;
            pad.Smoothed[axis] = 0f;
        }

        return current;
    }

    private static string ButtonsSeen(uint mask)
    {
        List<string> names = new List<string>();
        string[] labels = { "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "DUp", "DDown", "DLeft", "DRight", "Guide" };
        for (int i = 0; i < labels.Length; i += 1)
        {
            if ((mask & (1u << i)) != 0) names.Add(labels[i]);
        }
        return names.Count > 0 ? string.Join("+", names.ToArray()) : "keine";
    }

    // ------------------------------------------------------------
    // Selbsttest
    // ------------------------------------------------------------
    // Prüft, dass die XInput-Bits auf die richtigen Gamepad-Indizes
    // abgebildet werden. Ein Fehler hier war die Ursache dafür, dass
    // die Tastenkombination nicht erkannt wurde.

    // XInput-Tastenbits (xinput.h, wButtons).
    private const ushort XInputA = 0x1000;
    private const ushort XInputB = 0x2000;
    private const ushort XInputX = 0x4000;
    private const ushort XInputY = 0x8000;
    private const ushort XInputLB = 0x0100;
    private const ushort XInputRB = 0x0200;
    private const ushort XInputView = 0x0020;
    private const ushort XInputMenu = 0x0010;
    private const ushort XInputL3 = 0x0040;
    private const ushort XInputR3 = 0x0080;
    private const ushort XInputDPadUp = 0x0001;
    private const ushort XInputDPadDown = 0x0002;
    private const ushort XInputDPadLeft = 0x0004;
    private const ushort XInputDPadRight = 0x0008;
    // Nur XInputGetStateEx (undokumentiert): Bit 0x0400.
    private const ushort XInputGuide = 0x0400;

    // Gamepad-API-Indizes (Standardreihenfolge, siehe README).
    private const uint GamepadA = 1u << 0;
    private const uint GamepadB = 1u << 1;
    private const uint GamepadX = 1u << 2;
    private const uint GamepadY = 1u << 3;
    private const uint GamepadLB = 1u << 4;
    private const uint GamepadRB = 1u << 5;
    private const uint GamepadView = 1u << 8;
    private const uint GamepadMenu = 1u << 9;
    private const uint GamepadL3 = 1u << 10;
    private const uint GamepadR3 = 1u << 11;
    private const uint GamepadDPadUp = 1u << 12;
    private const uint GamepadDPadDown = 1u << 13;
    private const uint GamepadDPadLeft = 1u << 14;
    private const uint GamepadDPadRight = 1u << 15;
    private const uint GamepadGuide = 1u << 16;

    /// <summary>
    /// Entscheidet, ob ein Raw-Input-Guide-Signal in die Maske gehört.
    /// Reine, testbare Funktion.
    ///
    /// XInputGetStateEx liefert den Guide-Knopf bereits als Bit 0x0400.
    /// Raw Input ist dann weder nötig noch sicher: Bei normalen Xbox-
    /// HID-Reports lag die alte Heuristik auf einem Stick-/Datenbit und
    /// löste bei jeder Stickbewegung den Guide aus.
    /// </summary>
    public static bool ShouldUseRawGuide(bool stateExAvailable, bool rawPressed, ushort xinputButtons)
    {
        // Bei verfügbarem XInputGetStateEx ist XInput die einzige Quelle.
        if (stateExAvailable) return false;
        if (!rawPressed) return false;
        // GameSir-Dongles teilen sich im Rohreport das Bit für L3 und
        // Guide; XInput meldet L3 sauber als eigenes Bit.
        if ((xinputButtons & XInputL3) != 0) return false;
        return true;
    }

    /// <summary>
    /// Wandelt eine XInput-Tastenmaske in die Gamepad-Maske um.
    /// </summary>
    public static uint TranslateButtons(ushort xinputButtons)
    {
        uint mask = 0;
        if ((xinputButtons & XInputA) != 0) mask |= GamepadA;
        if ((xinputButtons & XInputB) != 0) mask |= GamepadB;
        if ((xinputButtons & XInputX) != 0) mask |= GamepadX;
        if ((xinputButtons & XInputY) != 0) mask |= GamepadY;
        if ((xinputButtons & XInputLB) != 0) mask |= GamepadLB;
        if ((xinputButtons & XInputRB) != 0) mask |= GamepadRB;
        if ((xinputButtons & XInputView) != 0) mask |= GamepadView;
        if ((xinputButtons & XInputMenu) != 0) mask |= GamepadMenu;
        if ((xinputButtons & XInputL3) != 0) mask |= GamepadL3;
        if ((xinputButtons & XInputR3) != 0) mask |= GamepadR3;
        if ((xinputButtons & XInputDPadUp) != 0) mask |= GamepadDPadUp;
        if ((xinputButtons & XInputDPadDown) != 0) mask |= GamepadDPadDown;
        if ((xinputButtons & XInputDPadLeft) != 0) mask |= GamepadDPadLeft;
        if ((xinputButtons & XInputDPadRight) != 0) mask |= GamepadDPadRight;
        if ((xinputButtons & XInputGuide) != 0) mask |= GamepadGuide;
        return mask;
    }

    private static int SelfTest()
    {
        // XInput-Bit -> erwarteter Gamepad-Index
        ushort[] bits = { 0x1000, 0x2000, 0x4000, 0x8000, 0x0100, 0x0200, 0x0020, 0x0010, 0x0040, 0x0080, 0x0001, 0x0002, 0x0004, 0x0008, 0x0400 };
        int[] expected = { 0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
        int errors = 0;
        for (int i = 0; i < bits.Length; i += 1)
        {
            uint mask = TranslateButtons(bits[i]);
            if (mask != (1u << expected[i]))
            {
                Console.WriteLine("FEHLER: XInput 0x" + bits[i].ToString("X4") + " -> Bit " + expected[i] + " erwartet, war " + mask);
                errors++;
            }
        }

        // Achsen-Überwachung: eine gesunde Achse darf nicht als
        // defekt gemeldet werden, eine verrauschte schon.
        InitWatch();
        float direction = 0f;
        for (int i = 0; i < 400; i += 1)
        {
            // Gesunde Achse: gleichmaessige Bewegung
            direction = (i / 40) % 2 == 0 ? 0.7f : -0.7f;
            TrackAxis(0, direction);
        }
        if (AxisIsNoisy(0))
        {
            Console.WriteLine("FEHLER: Gesunde Achse wurde als defekt gemeldet");
            errors++;
        }

        InitWatch();
        for (int i = 0; i < 400; i += 1)
        {
            // Defekte Achse: springt zwischen grossen Werten
            float broken = (i % 2 == 0) ? 0.9f : -0.9f;
            TrackAxis(1, broken);
        }
        if (!AxisIsNoisy(1))
        {
            Console.WriteLine("FEHLER: Defekte Achse wurde nicht erkannt");
            errors++;
        }

        // Achsen-Normalisierung: Die Daumenachsen sind 16-Bit-Werte.
        if (Axis(32767) < 0.999f || Axis(-32768) > -0.999f || Axis(0) != 0f)
        {
            Console.WriteLine("FEHLER: Achsen-Normalisierung ist falsch");
            errors++;
        }

        // Guide-Quelle: Raw-Input darf bei verfügbarem XInputGetStateEx
        // niemals zusätzlich Bit 16 setzen. Der Bugfall war eine
        // Stickbewegung, die im Raw-Report ein falsches Guide-Bit
        // erzeugte und das Overlay öffnete.
        if (ShouldUseRawGuide(true, true, 0))
        {
            Console.WriteLine("FEHLER: Raw-Guide bei XInputGetStateEx aktiv");
            errors++;
        }
        if (!ShouldUseRawGuide(false, true, 0))
        {
            Console.WriteLine("FEHLER: Raw-Guide-Fallback fehlt");
            errors++;
        }
        if (ShouldUseRawGuide(false, true, XInputL3))
        {
            Console.WriteLine("FEHLER: L3-Schutz für Raw-Guide fehlt");
            errors++;
        }
        if (ShouldUseRawGuide(false, false, 0))
        {
            Console.WriteLine("FEHLER: Raw-Guide ohne Raw-Signal aktiv");
            errors++;
        }

        // Struktur-Belegung gegen die offizielle xinput.h-Definition
        // pruefen. Ein verschobenes Feld liest die Bytes des
        // Nachbarn - das war die Ursache dafuer, dass die Trigger
        // beim Bewegen des Sticks mitliefen.
        string[] fieldNames = { "Buttons", "LeftTrigger", "RightTrigger", "ThumbLX", "ThumbLY", "ThumbRX", "ThumbRY" };
        int[] fieldOffsets = { 0, 2, 3, 4, 6, 8, 10 };
        for (int i = 0; i < fieldNames.Length; i += 1)
        {
            int actual = (int)Marshal.OffsetOf(typeof(XInputGamepad), fieldNames[i]);
            if (actual != fieldOffsets[i])
            {
                Console.WriteLine("FEHLER: Feld " + fieldNames[i] + " liegt bei Offset " + actual + ", erwartet " + fieldOffsets[i]);
                errors++;
            }
        }
        if (Marshal.SizeOf(typeof(XInputGamepad)) != 12)
        {
            Console.WriteLine("FEHLER: XINPUT_GAMEPAD muss 12 Byte groß sein, ist " + Marshal.SizeOf(typeof(XInputGamepad)));
            errors++;
        }
        if (Marshal.SizeOf(typeof(XInputState)) != 16)
        {
            Console.WriteLine("FEHLER: XINPUT_STATE muss 16 Byte groß sein, ist " + Marshal.SizeOf(typeof(XInputState)));
            errors++;
        }

        Console.WriteLine(errors == 0 ? "SELFTEST OK" : "SELFTEST FEHLER: " + errors);
        return errors == 0 ? 0 : 1;
    }

    private static readonly Pad[] Pads = new Pad[4];

    private static string F(float value)
    {
        return value.ToString("0.###", CultureInfo.InvariantCulture);
    }

    private static float Axis(short raw)
    {
        // Die Daumenachsen sind SHORT-Werte im Bereich -32768..32767.
        float value = raw / 32767f;
        if (value > 1f) value = 1f;
        if (value < -1f) value = -1f;
        return value;
    }

    private static string Describe(uint buttons, float lt, float rt, float lx, float ly, float rx, float ry)
    {
        return F(lt) + " " + F(rt) + " " + F(lx) + " " + F(ly) + " " + F(rx) + " " + F(ry) + " " + buttons.ToString(CultureInfo.InvariantCulture);
    }

    public static int Main(string[] args)
    {
        for (int i = 0; i < Pads.Length; i++) Pads[i] = new Pad();
        InitWatch();

        for (int i = 0; i < args.Length; i += 1)
        {
            if (args[i] == "--diag") RawInputGuide.Diagnostics = true;
            if (args[i] == "--raw") RawDiagnostics = true;
            if (args[i] == "--selftest") return SelfTest();
            if (args[i] == "--detect-broken") DetectBrokenAxis = true;
            if (args[i].StartsWith("--filter="))
            {
                int level;
                if (int.TryParse(args[i].Substring(9), out level)) FilterLevel = level;
            }
        }

        Console.WriteLine("V 1");
        Console.Out.Flush();

        // Beste verfügbare XInput-Funktion bestimmen: XInputGetStateEx
        // meldet zusätzlich den Guide-Knopf (Bit 0x0400).
        InitXInput();
        Console.WriteLine("X " + (StateExAvailable ? "1" : "0"));
        Console.Out.Flush();

        // Guide-Quelle protokollieren (eine Zeile, damit das Log des
        // Overlays die Ursache eindeutig zeigt).
        Console.WriteLine("Guide-Quelle: " + (StateExAvailable ? "XInputGetStateEx" : "Raw-Input (Fallback)"));
        if (StateExAvailable)
        {
            Console.WriteLine("Raw-Guide deaktiviert (XInputGetStateEx verfügbar)");
            // Guide ist über XInput lesbar - dieselbe Statuszeile wie
            // beim Raw-Input-Weg, damit die Oberfläche ihn anbietet.
            Console.WriteLine("G 1");
        }
        Console.Out.Flush();

        // Raw Input nur als Rückfallebene, wenn XInput den Guide nicht
        // liefern kann. Sonst kämen bei normalen Xbox-HID-Reports
        // Stick-Bits als Guide an (Overlay öffnete sich bei jeder
        // Stickbewegung).
        if (!StateExAvailable)
        {
            try
            {
                RawInputGuide.Start();
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("Raw Input nicht verfügbar: " + error.Message);
            }
        }

        // Vibration aus der Standardausgabe lesen (Blockierend, aber
        // nur aktiv, wenn tatsächlich eine Anfrage kommt).
        Thread vibrationThread = new Thread(ReadVibration);
        vibrationThread.IsBackground = true;
        vibrationThread.Start();

        while (true)
        {
            for (uint index = 0; index < 4; index++)
            {
                try
                {
                XInputState state = new XInputState();
                // XInputGetStateEx wenn verfügbar (meldet den Guide-
                // Knopf als Bit 0x0400), sonst die normale Funktion.
                uint result = ActiveGetState(index, ref state);
                Pad pad = Pads[index];
                bool connected = result == ErrorSuccess;

                if (!connected)
                {
                    if (pad.Connected)
                    {
                        pad.Connected = false;
                        Console.WriteLine("S " + index + " 0 0 0 0 0 0 0 0");
                        Console.Out.Flush();
                    }
                    pad.BatteryLevel = 255;
                    pad.LastBatteryAt = DateTime.MinValue;
                    continue;
                }

                // Batterie-Status ca. alle 30 s abfragen (XInputGetBatteryInformation
                // ist langsam und der Wert ändert sich selten). Bei erster
                // Verbindung wird sofort gemessen.
                if ((DateTime.UtcNow - pad.LastBatteryAt).TotalSeconds >= 30)
                {
                    pad.LastBatteryAt = DateTime.UtcNow;
                    try
                    {
                        XInputBatteryInformation battery = new XInputBatteryInformation();
                        if (XInputGetBatteryInformation(index, BatteryDeviceTypeGamepad, ref battery) == ErrorSuccess
                            && battery.BatteryType >= 2)
                        {
                            if (battery.BatteryLevel != pad.BatteryLevel)
                            {
                                pad.BatteryLevel = battery.BatteryLevel;
                                Console.WriteLine("P " + index + " " + battery.BatteryLevel);
                                Console.Out.Flush();
                            }
                        }
                    }
                    catch (Exception)
                    {
                        // Batterie-Abfrage ist optional - niemals den Helfer beenden.
                    }
                }

                // XInput-Maske auf Gamepad-API-Reihenfolge bringen:
                // XInput-Bitmaske (xinput.h) auf die Reihenfolge der
                // Gamepad-API umsetzen:
                //   A B X Y LB RB View Menu L3 R3 DUp DDown DLeft DRight Guide
                //
                // Achtung: Die XInput-Bits haben eine eigene Reihenfolge:
                //   DPadUp 0x0001  DPadDown 0x0002  DPadLeft 0x0004
                //   DPadRight 0x0008  Start 0x0010  Back 0x0020
                //   LeftThumb 0x0040  RightThumb 0x0080
                //   LeftShoulder 0x0100  RightShoulder 0x0200
                //   A 0x1000  B 0x2000  X 0x4000  Y 0x8000
                uint mask = TranslateButtons(state.Gamepad.Buttons);

                // Guide nur aus Raw Input, wenn XInputGetStateEx fehlt.
                // Bei verfügbarem StateEx liefert XInput den Guide
                // bereits als Bit 0x0400 über TranslateButtons. Raw
                // Input ist dann deaktiviert, damit Stick-/Datenbits
                // nicht als Guide gelten.
                if (!StateExAvailable)
                {
                    bool rawPressed = false;
                    try
                    {
                        rawPressed = RawInputGuide.IsGuidePressed();
                    }
                    catch (Exception)
                    {
                        // ignorieren
                    }
                    if (ShouldUseRawGuide(StateExAvailable, rawPressed, state.Gamepad.Buttons))
                    {
                        mask |= 1u << 16;
                    }
                }

                float lt = state.Gamepad.LeftTrigger / 255f;
                float rt = state.Gamepad.RightTrigger / 255f;

                // Viele günstige Xbox-360-Kopien liefern stark
                // schwankende Achsenwerte: der Stick springt
                // sporadisch auf vollen Ausschlag und zurück. Solche
                // Ausreißer würden den Cursor wild hin und her
                // springen lassen. Deshalb werden die Werte hier
                // bereits gefiltert:
                //   - unterhalb der Ruhezone gilt der Stick als los
                //   - ein Wert muss mehrere Messungen stabil bleiben,
                //     bevor er übernommen wird
                //   - danach wird geglättet
                float rawLx = Axis(state.Gamepad.ThumbLX);
                float rawLy = Axis(state.Gamepad.ThumbLY);
                float rawRx = Axis(state.Gamepad.ThumbRX);
                float rawRy = Axis(state.Gamepad.ThumbRY);

                float lx = Filter(pad, 0, rawLx);
                float ly = Filter(pad, 1, rawLy);
                float rx = Filter(pad, 2, rawRx);
                float ry = Filter(pad, 3, rawRy);

                // Diagnose: Rohwerte melden, damit sich Achsen-
                // probleme von Zuordnungsproblemen unterscheiden
                // lassen.
                if (RawDiagnostics)
                {
                    Console.WriteLine("X " + Axis(state.Gamepad.ThumbLX).ToString("0.000", CultureInfo.InvariantCulture)
                        + " " + Axis(state.Gamepad.ThumbLY).ToString("0.000", CultureInfo.InvariantCulture)
                        + " " + Axis(state.Gamepad.ThumbRX).ToString("0.000", CultureInfo.InvariantCulture)
                        + " " + Axis(state.Gamepad.ThumbRY).ToString("0.000", CultureInfo.InvariantCulture));
                    Console.Out.Flush();
                }

                bool changed = !pad.Connected
                    || pad.Buttons != mask
                    || Math.Abs(pad.LeftTrigger - lt) > 0.01f
                    || Math.Abs(pad.RightTrigger - rt) > 0.01f
                    || Math.Abs(pad.LX - lx) > 0.005f
                    || Math.Abs(pad.LY - ly) > 0.005f
                    || Math.Abs(pad.RX - rx) > 0.005f
                    || Math.Abs(pad.RY - ry) > 0.005f;

                if (!changed) continue;

                pad.Connected = true;
                pad.Buttons = mask;
                pad.LeftTrigger = lt;
                pad.RightTrigger = rt;
                pad.LX = lx;
                pad.LY = ly;
                pad.RX = rx;
                pad.RY = ry;

                Console.WriteLine("S " + index + " 1 " + Describe(mask, lt, rt, lx, ly, rx, ry)
                    + " " + F(rawLx) + " " + F(rawLy) + " " + F(rawRx) + " " + F(rawRy));
                Console.Out.Flush();

                // Diagnose: melden, welche Knöpfe der Treiber kennt.
                if (!pad.Reported)
                {
                    pad.Reported = true;
                    Console.WriteLine("B " + index + " " + ButtonsSeen(mask));
                    Console.Out.Flush();
                }
                }
                catch (Exception error)
                {
                    // Ein Fehler darf den Helfer nicht beenden.
                    Console.Error.WriteLine("Abfragefehler: " + error.Message);
                }
            }

            Thread.Sleep(6);
        }
    }

    private static void SetVibration(uint index, float strength, int duration)
    {
        try
        {
            ushort left = (ushort)(strength * 65535f);
            ushort right = (ushort)(strength * 65535f);
            XInputVibration vibration = new XInputVibration();
            vibration.LeftMotorSpeed = left;
            vibration.RightMotorSpeed = right;
            try { XInputSetVibration14(index, ref vibration); }
            catch (Exception) { XInputSetVibration13(index, ref vibration); }
            if (duration > 0)
            {
                Thread.Sleep(duration);
                XInputVibration stop = new XInputVibration();
                try { XInputSetVibration14(index, ref stop); }
                catch (Exception) { XInputSetVibration13(index, ref stop); }
            }
        }
        catch (Exception error)
        {
            // Vibration ist optional - niemals den ganzen Helfer beenden.
            Console.Error.WriteLine("Vibration fehlgeschlagen: " + error.Message);
        }
    }

    private static void ReadVibration()
    {
        // Liest Befehle von der Standardausgabe:
        //   R <index> <staerke> <dauer>   Vibration
        //   M <aktion> <x> <y> [delta]    echte Maus (move/down/up/wheel)
        while (true)
        {
            string line = Console.In.ReadLine();
            if (line == null) return;
            if (line.Length == 0) continue;
            string[] parts = line.Split(' ');

            // Echte Maus-Bewegung: notwendig für Drag-and-Drop, da
            // CDP keinen HTML5-Drag starten kann.
            if (parts[0] == "M" && parts.Length >= 4)
            {
                int x, y;
                if (!int.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out x)) continue;
                if (!int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out y)) continue;
                int delta = 0;
                if (parts.Length >= 5)
                {
                    int.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out delta);
                }
                NativeMouse(parts[1], x, y, delta);
                continue;
            }

            if (parts.Length < 4 || parts[0] != "R") continue;

            uint index;
            float strength;
            int duration;
            if (!uint.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out index)) continue;
            if (!float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out strength)) continue;
            if (!int.TryParse(parts[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out duration)) continue;
            if (index > 3) continue;
            if (strength < 0f) strength = 0f;
            if (strength > 1f) strength = 1f;
            if (duration < 0) duration = 0;
            if (duration > 5000) duration = 5000;

            SetVibration(index, strength, duration);
        }
    }
}
