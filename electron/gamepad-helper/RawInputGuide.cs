// ============================================================
// Raw-Input-Hilfscode für den Guide-/Xbox-Knopf
// ============================================================
// XInput meldet den Guide-Knopf nicht (wButtons ist nur 16 Bit
// breit). Raw Input liest das HID-Gerät direkt und liefert jede
// Tastenänderung - auch den Xbox-Knopf in der Mitte.
//
// Damit das funktioniert, wird das HID-Protokoll ausgewertet:
// Der Treiber liefert Reports, in denen jedes Bit einem Knopf
// entspricht. Beim Xbox-360-Pad ist der Guide-Knopf der Knopf mit
// der Usage-ID 0x0C ("Consumer Control" / Auxiliary Button).
//
// Dafür braucht es ein Nachrichtenfenster und eine Nachrichten-
// schleife. Beides läuft auf einem eigenen Thread, damit die
// XInput-Abfrage nicht gestört wird.
// ============================================================

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class RawInputGuide
{
    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const uint WM_INPUT = 0x00FF;

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASS
    {
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszMenuName;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterRawInputDevices([In, Out] RAWINPUTDEVICE[] devices, uint count, uint size);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputData(IntPtr hRawInput, uint command, IntPtr data, ref uint size, uint headerSize);

    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG message, IntPtr hWnd, uint min, uint max);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG message);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG message);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "RegisterClassW")]
    private static extern ushort RegisterClassSimple(ref WNDCLASS windowClass);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowEx(uint exStyle, string className, string windowName, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);

    [DllImport("user32.dll")]
    private static extern IntPtr DefWindowProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputDeviceList(IntPtr list, ref uint count, uint size);

    // RAWINPUTDEVICELIST: Handle zuerst, dann Typ (So definiert es
    // winuser.h - dwType zuerst zu lesen liefert Müll).
    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICELIST
    {
        public IntPtr hDevice;
        public uint dwType;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RID_DEVICE_INFO_HID
    {
        public uint dwVendorId;
        public uint dwProductId;
        public uint dwVersionNumber;
        public ushort usUsagePage;
        public ushort usUsage;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RID_DEVICE_INFO_KEYBOARD
    {
        public uint dwType;
        public uint dwSubType;
        public uint dwKeyboardMode;
        public uint dwNumberOfFunctionKeys;
        public uint dwNumberOfIndicators;
        public uint dwNumberOfKeysTotal;
    }

    // RID_DEVICE_INFO: cbSize + dwType + Union (Keyboard-Teil ist der
    // größte, daher 32 Byte - mit einer kleineren Struktur schlägt die
    // Abfrage mit Fehler 122 fehl).
    [StructLayout(LayoutKind.Explicit)]
    private struct RID_DEVICE_INFO
    {
        [FieldOffset(0)] public int cbSize;
        [FieldOffset(4)] public uint dwType;
        [FieldOffset(8)] public RID_DEVICE_INFO_HID hid;
        [FieldOffset(8)] public RID_DEVICE_INFO_KEYBOARD keyboard;
    }

    private const uint RID_INPUT = 0x10000003;
    private const uint RIDI_DEVICEINFO = 0x2000000b;
    private const uint RIM_TYPEHID = 2;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputDeviceInfo(IntPtr hDevice, uint command, ref RID_DEVICE_INFO info, ref uint size);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string name);

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private static volatile bool GuidePressed;
    private static volatile bool Running;
    private static Thread Worker;
    private static WndProcDelegate ProcKeepAlive;

    /// <summary>
    /// Startet die Raw-Input-Überwachung (eigener Thread).
    /// </summary>
    public static void Start()
    {
        if (Running) return;
        // Sicherheitsnetz: Bei XInputGetStateEx ist Raw Input unnötig
        // und kann Fehlauslösungen erzeugen.
        try
        {
            if (GamepadHelper.StateExAvailable) return;
        }
        catch (Exception)
        {
            // Wenn die Prüfung nicht möglich ist, bleibt der Fallback.
        }
        Running = true;
        Worker = new Thread(Run);
        Worker.IsBackground = true;
        Worker.Start();
    }

    /// <summary>
    /// true, solange der Guide-Knopf gedrückt gehalten wird.
    /// </summary>
    public static bool IsGuidePressed()
    {
        return GuidePressed;
    }

    private static void Run()
    {
        IntPtr hwnd = IntPtr.Zero;
        try
        {
            ProcKeepAlive = new WndProcDelegate(WndProc);
            WNDCLASS windowClass = new WNDCLASS();
            windowClass.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(ProcKeepAlive);
            windowClass.hInstance = GetModuleHandle(null);
            windowClass.lpszClassName = "D2RawInputGuide";
            if (RegisterClassSimple(ref windowClass) == 0)
            {
                Console.Error.WriteLine("[raw] RegisterClass fehlgeschlagen");
                return;
            }

            hwnd = CreateWindowEx(0, "D2RawInputGuide", "", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, windowClass.hInstance, IntPtr.Zero);
            if (hwnd == IntPtr.Zero)
            {
                Console.Error.WriteLine("[raw] CreateWindowEx fehlgeschlagen");
                return;
            }

            // Für Gamepad (0x04) und Joystick (0x05) registrieren:
            // Drittanbieter-Controller (z. B. GameSir Nova Lite) melden
            // sich über Raw Input als Joystick, nicht als Gamepad.
            // Ohne diese Registrierung kommen ihre Reports nie an.
            RAWINPUTDEVICE[] devices = new RAWINPUTDEVICE[2];
            devices[0].usUsagePage = 0x01; // HID
            devices[0].usUsage = 0x04;      // Gamepad
            devices[0].dwFlags = RIDEV_INPUTSINK;
            devices[0].hwndTarget = hwnd;
            devices[1].usUsagePage = 0x01; // HID
            devices[1].usUsage = 0x05;      // Joystick
            devices[1].dwFlags = RIDEV_INPUTSINK;
            devices[1].hwndTarget = hwnd;
            if (!RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
            {
                Console.Error.WriteLine("[raw] RegisterRawInputDevices fehlgeschlagen: " + Marshal.GetLastWin32Error());
            }
            else
            {
                // Guide-Knopf lesbar, wenn XInputGetStateEx verfügbar
                // ist (primärer Weg, meldet den Knopf als Bit 0x0400)
                // ODER Raw Input Gamepad-/Joystick-Geräte sieht
                // (Zusatzweg). Keine Geräte sichtbar (z. B. Xbox-360-
                // Pads, deren XInput-Treiber kein HID anlegt) -> nur
                // dann fehlt der Guide-Knopf wirklich.
                bool xinputEx = false;
                try { xinputEx = GamepadHelper.StateExAvailable; } catch (Exception) { }
                if (xinputEx || CountRawDevices() > 0)
                {
                    Console.WriteLine("G 1");
                }
                else
                {
                    Console.WriteLine("G 0");
                }
                Console.Out.Flush();
            }

            MSG message;
            while (Running)
            {
                while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
                {
                    if (message.message == WM_INPUT)
                    {
                        HandleInput(message.lParam);
                    }
                    TranslateMessage(ref message);
                    DispatchMessage(ref message);
                }
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("[raw] Fehler: " + error.Message);
        }
    }

    private static IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    private static void HandleInput(IntPtr lParam)
    {
        try
        {
            uint size = 0;
            int headerSize = Marshal.SizeOf(typeof(RAWINPUTHEADER));
            // RID_INPUT ist 0x10000003, nicht 0x100! Mit 0x100 schlägt
            // der Aufruf mit Fehler 87 fehl, size bleibt 0 - dann wurden
            // WM_INPUT-Reports nie gelesen und der Guide-Knopf konnte
            // grundsätzlich nicht erkannt werden.
            if (GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, (uint)headerSize) == 0xFFFFFFFF) return;
            if (size == 0) return;

            IntPtr buffer = Marshal.AllocHGlobal((int)size);
            try
            {
                uint got = size;
                if (GetRawInputData(lParam, RID_INPUT, buffer, ref got, (uint)headerSize) != size) return;

                RAWINPUTHEADER header = (RAWINPUTHEADER)Marshal.PtrToStructure(buffer, typeof(RAWINPUTHEADER));
                // HID-Reports haben den Typ 2 (RIM_TYPEHID). Typ 1 wäre
                // Tastatur - die alte Prüfung auf 1 verwarf dadurch alle
                // Controller-Reports.
                if (header.dwType != RIM_TYPEHID) return;

                // RAWHID: nach dem Header folgen dwSizeHid (4 Byte,
                // Größe eines einzelnen Reports) und dwCount (4 Byte,
                // Anzahl der Reports in bRawData). Erst danach beginnen
                // die eigentlichen Report-Bytes.
                uint reportSize = (uint)Marshal.ReadInt32(buffer, headerSize);
                uint reportCount = (uint)Marshal.ReadInt32(buffer, headerSize + 4);
                if (reportSize == 0 || reportCount == 0) return;
                int dataOffset = headerSize + 8;
                int dataLength = (int)(reportSize * reportCount);
                if (dataOffset + dataLength > (int)size)
                {
                    // Fallback: alles nach dem Header (falls die Struktur
                    // anders aufgebaut ist als erwartet).
                    dataOffset = headerSize;
                    dataLength = (int)size - headerSize;
                }
                if (dataLength <= 0) return;

                byte[] data = new byte[dataLength];
                Marshal.Copy((IntPtr)((long)buffer + dataOffset), data, 0, data.Length);

                // Diagnose: Rohdaten melden, damit sich die Position
                // des Guide-Knopfes prüfen lässt.
                if (Diagnostics)
                {
                    string text = "R";
                    for (int i = 0; i < data.Length; i += 1) text += " " + data[i].ToString("X2");
                    Console.WriteLine(text);
                    Console.Out.Flush();
                }

                LastRaw = BitConverter.ToString(data);
                GuidePressed = DetectGuide(data, VendorOf(header.hDevice));
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        catch (Exception)
        {
            // ignorieren
        }
    }

    /// <summary>
    /// Zählt die Raw-Input-Geräte, die Gamepad- oder Joystick-Reports
    /// liefern können (Diagnose).
    ///
    /// GetRawInputDeviceList verlangt in cbSize die Größe der
    /// RAWINPUTDEVICELIST-Struktur. Mit 0 schlägt der Aufruf mit
    /// Fehler 87 fehl und die Anzahl blieb 0 - deshalb wurde der
    /// Guide-Knopf vorher immer als "nicht verfügbar" gemeldet,
    /// obwohl Geräte vorhanden waren.
    /// </summary>
    private static int CountRawDevices()
    {
        try
        {
            uint count = 0;
            uint listSize = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
            if (GetRawInputDeviceList(IntPtr.Zero, ref count, listSize) == 0xFFFFFFFF) return -1;
            if (count == 0) return 0;

            IntPtr buffer = Marshal.AllocHGlobal((int)(count * listSize));
            try
            {
                uint got = count;
                if (GetRawInputDeviceList(buffer, ref got, listSize) == 0xFFFFFFFF) return 0;

                int gamepads = 0;
                for (uint i = 0; i < got; i += 1)
                {
                    IntPtr item = (IntPtr)((long)buffer + (long)(i * listSize));
                    RAWINPUTDEVICELIST device = (RAWINPUTDEVICELIST)Marshal.PtrToStructure(item, typeof(RAWINPUTDEVICELIST));
                    if (device.dwType != RIM_TYPEHID) continue; // Nur HID-Geräte

                    // Gerät genauer ansehen: nur Standard-Gamepad (0x04)
                    // oder Joystick (0x05) auf Usage-Seite 0x01 liefert
                    // Reports, zu denen wir uns registriert haben.
                    RID_DEVICE_INFO info = new RID_DEVICE_INFO();
                    int infoSize = Marshal.SizeOf(typeof(RID_DEVICE_INFO));
                    info.cbSize = infoSize;
                    uint size = (uint)infoSize;
                    if (GetRawInputDeviceInfo(device.hDevice, RIDI_DEVICEINFO, ref info, ref size) == 0xFFFFFFFF) continue;
                    if (info.dwType != RIM_TYPEHID) continue;
                    if (info.hid.usUsagePage == 0x01 && (info.hid.usUsage == 0x04 || info.hid.usUsage == 0x05)) gamepads += 1;
                }
                return gamepads;
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }
        catch (Exception)
        {
            return -1;
        }
    }

    /// <summary>
    /// Rohdaten der HID-Reports ausgeben (Diagnose).
    /// </summary>
    public static bool Diagnostics;

    /// <summary>
    /// Letzte Rohdaten (für die Diagnose).
    /// </summary>
    public static string LastRaw = "";

    // Hersteller-ID je Gerät cachen (Abfrage pro Report wäre zu teuer).
    private static readonly Dictionary<long, uint> VendorCache = new Dictionary<long, uint>();

    /// <summary>
    /// Liest die Hersteller-ID (Vendor ID) eines Raw-Input-Geräts.
    /// GameSir-Controller melden ihre Reports in einem herstellerspe-
    /// zifischen Layout - deshalb entscheidet die VID, wo der Guide-
    /// Knopf im Report liegt.
    /// </summary>
    private static uint VendorOf(IntPtr hDevice)
    {
        if (hDevice == IntPtr.Zero) return 0;
        long key = hDevice.ToInt64();
        lock (VendorCache)
        {
            uint known;
            if (VendorCache.TryGetValue(key, out known)) return known;
        }
        uint vendor = 0;
        try
        {
            RID_DEVICE_INFO info = new RID_DEVICE_INFO();
            int size = Marshal.SizeOf(typeof(RID_DEVICE_INFO));
            info.cbSize = size;
            uint bytes = (uint)size;
            if (GetRawInputDeviceInfo(hDevice, RIDI_DEVICEINFO, ref info, ref bytes) != 0xFFFFFFFF
                && info.dwType == RIM_TYPEHID)
            {
                vendor = info.hid.dwVendorId;
            }
        }
        catch (Exception)
        {
            // Dann gilt das Standard-Layout.
        }
        lock (VendorCache) { VendorCache[key] = vendor; }
        return vendor;
    }

    /// <summary>
    /// Sucht den Guide-Knopf in einem HID-Report.
    ///
    /// Gemessen am GameSir Nova Lite (VID 0x3537, Dongle-Modus): Der
    /// Joystick-Report ist 15 Byte lang, die Knöpfe liegen als Little-
    /// Endian-Bitfeld in Byte 11-14:
    ///   Byte 11, Bit 0-7: A B X Y LB RB View Menu
    ///   Byte 12, Bit 0:   Guide-Knopf
    ///   Byte 12, Bit 1-2: L3 R3
    ///   Byte 12, Bit 2-4: Steuerkreuz (Hat-Kodierung)
    /// Trigger liegen in Byte 9-10, die Sticks in Byte 1-8. Keine
    /// andere Taste, kein Stick und kein Trigger setzt Byte 12 Bit 0 -
    /// das Bit ist also eindeutig dem Guide-Knopf zugeordnet. (Die
    /// alte Code-Version las stattdessen Byte 1 Bit 0 - das ist beim
    /// Nova Lite linker-Stick-Datum und löste bei jeder Stickbewegung
    /// falsch aus.)
    ///
    /// Für unbekannte Hersteller wird bewusst nichts geraten: Die
    /// frühere "Byte 1 Bit 0"-Heuristik traf bei normalen Xbox-HID-
    /// Reports ein Stick-/Datenbit und meldete bei jeder Stickbewegung
    /// den Guide. Ohne XInputGetStateEx gibt es dann keinen Guide über
    /// Raw Input; Nutzer wählen eine andere Toggle-Taste. Lieber kein
    /// Guide als Fehlauslösungen.
    /// </summary>
    private static bool DetectGuide(byte[] data, uint vendorId)
    {
        if (data == null || data.Length < 4) return false;

        if (vendorId == 0x3537 && data.Length == 15)
        {
            // GameSir-Layout (z. B. Nova Lite): Guide = Byte 12, Bit 0.
            return (data[12] & 0x01) != 0;
        }

        return false;
    }
}
