"use client";
import { useState } from "react";

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || "June";

export default function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function tryUnlock() {
    if (input.trim() === APP_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setInput("");
    }
  }

  return (
    <div className="gate-overlay">
      <style>{`@keyframes shakeX { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`}</style>
      <div className="gate-card" style={shake ? { animation: "shakeX 0.4s ease" } : {}}>
        <div className="gate-icon">🏮</div>
        <div className="gate-title">Junebook</div>
        <div className="gate-sub">Chinese Picture Book Generator</div>
        <input
          className="gate-input"
          type="password"
          placeholder="Enter passphrase"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false); }}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          autoFocus
        />
        <button className="gate-btn" onClick={tryUnlock}>Enter 进入</button>
        {error && <div className="gate-error">Incorrect passphrase — try again</div>}
        <div className="gate-hint">Ask for the password 😊</div>
      </div>
    </div>
  );
}
