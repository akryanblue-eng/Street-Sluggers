interface Props {
  onStart: () => void;
}

export function MainMenu({ onStart }: Props) {
  return (
    <div className="menu-screen">
      <div className="menu-card">
        <h1 className="menu-title">
          STREET<span>SLUGGERS</span>
        </h1>
        <p className="menu-tagline">Exaggerated arcade street baseball. Time it. Crush it.</p>

        <button className="btn btn-primary" onClick={onStart}>
          Play Ball
        </button>

        <div className="menu-controls">
          <h2>Controls</h2>
          <ul>
            <li>
              <kbd>Space</kbd> / <kbd>Tap</kbd> — Contact swing
            </li>
            <li>
              <kbd>Shift</kbd> / <kbd>Long-press</kbd> — Power swing
            </li>
          </ul>
          <p className="menu-hint">
            Swing when the closing ring snaps onto the target for a perfect barrel.
          </p>
        </div>
      </div>
    </div>
  );
}
