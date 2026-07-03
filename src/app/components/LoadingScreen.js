export default function LoadingScreen({ loadingMsg, progress }) {
  return (
    <div className="loading-screen">
      <div className="loading-lantern">🏮</div>
      <div className="loading-text">{loadingMsg}</div>
      <div className="loading-sub">Creating your personalized picture book…</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
