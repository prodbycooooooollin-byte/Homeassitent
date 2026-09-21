// Clearspace nutzt WPF fuer die Oberflaeche und Windows Forms ausschliesslich fuer das
// Infobereichssymbol. Beide Bibliotheken bringen gleichnamige Typen mit. Diese Aliase legen
// einmal zentral fest, dass immer die WPF-Variante gemeint ist.

global using Application = System.Windows.Application;
global using Button = System.Windows.Controls.Button;
global using CheckBox = System.Windows.Controls.CheckBox;
global using ComboBox = System.Windows.Controls.ComboBox;
global using Color = System.Windows.Media.Color;
global using Colors = System.Windows.Media.Colors;
global using KeyEventArgs = System.Windows.Input.KeyEventArgs;
global using ListBox = System.Windows.Controls.ListBox;
global using MessageBox = System.Windows.MessageBox;
global using RadioButton = System.Windows.Controls.RadioButton;
global using SystemColors = System.Windows.SystemColors;
global using TextBox = System.Windows.Controls.TextBox;
global using UserControl = System.Windows.Controls.UserControl;
