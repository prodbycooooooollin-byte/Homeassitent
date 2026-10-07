package dev.vaultsync.mc;

import dev.vaultsync.core.SyncEngine;

import javax.swing.*;
import java.awt.*;

/**
 * Kleines Fenster mit Fortschrittsbalken für den Fall, dass das ganze Spiel geschlossen wird: Minecraft zeichnet dann nicht mehr,
 * der Upload läuft aber noch. Wird nur unter Windows/Linux gezeigt und nie, wenn kein Bildschirm verfügbar ist.
 */
final class QuitProgressWindow {
    private QuitProgressWindow() { }

    /** @return Aktion, die das Fenster wieder schließt */
    static Runnable show(SyncEngine engine) {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("mac") || GraphicsEnvironment.isHeadless()) return () -> { };
        try {
            final JWindow[] win = new JWindow[1];
            final Timer[] timer = new Timer[1];
            SwingUtilities.invokeAndWait(() -> {
                JWindow w = new JWindow();
                JPanel panel = new JPanel(new BorderLayout(0, 8));
                panel.setBackground(new Color(0x1C1C1E));
                panel.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(new Color(0x3A3A3C)), BorderFactory.createEmptyBorder(14, 16, 14, 16)));
                JLabel title = new JLabel("Vault sichert deine Welt …");
                title.setForeground(Color.WHITE); title.setFont(title.getFont().deriveFont(Font.BOLD, 14f));
                JLabel sub = new JLabel("Bitte warten");
                sub.setForeground(new Color(0xAEAEB2));
                JProgressBar bar = new JProgressBar(0, 1000);
                bar.setIndeterminate(true);
                JPanel top = new JPanel(new GridLayout(2, 1)); top.setOpaque(false); top.add(title); top.add(sub);
                panel.add(top, BorderLayout.NORTH); panel.add(bar, BorderLayout.SOUTH);
                w.setContentPane(panel);
                w.setSize(340, 100);
                w.setLocationRelativeTo(null);
                w.setAlwaysOnTop(true);
                Timer t = new Timer(150, e -> {
                    double p = engine.progress();
                    String phase = engine.phase().isEmpty() ? "Bitte warten" : engine.phase();
                    sub.setText(p > 0.005 ? phase + " " + Math.round(p * 100) + " %" : phase + " …");
                    if (p > 0.005) { bar.setIndeterminate(false); bar.setValue((int) Math.round(p * 1000)); } else bar.setIndeterminate(true);
                });
                t.start();
                w.setVisible(true);
                win[0] = w; timer[0] = t;
            });
            return () -> SwingUtilities.invokeLater(() -> { if (timer[0] != null) timer[0].stop(); if (win[0] != null) win[0].dispose(); });
        } catch (Throwable t) {
            return () -> { };
        }
    }
}
