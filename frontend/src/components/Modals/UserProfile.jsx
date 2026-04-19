import React from 'react';

const UserProfile = ({
  showUserProfile,
  setShowUserProfile,
  userPersona,
  setUserPersona,
  API,
  addLog
}) => {
  if (!showUserProfile) return null;

  const handleSaveUserProfile = async () => {
    try {
      const r = await fetch(`${API}/user/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPersona)
      });
      if (r.ok) {
        addLog("✅ USER_PROFILE_SYNCED", "sys");
        setShowUserProfile(false);
      }
    } catch (e) {
      addLog("❌ USER_PROFILE_SYNC_FAILED", "err");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>👤 Your Cognitive Profile</h2>
          <button className="close-btn" onClick={() => setShowUserProfile(false)}>×</button>
        </div>
        <div className="forge-form">
          <div className="form-group">
            <label>Communication Style</label>
            <select
              value={userPersona.profile.communication_style}
              onChange={e => setUserPersona({
                ...userPersona,
                profile: { ...userPersona.profile, communication_style: e.target.value }
              })}
            >
              <option value="balanced">Balanced</option>
              <option value="direct">Direct / Concise</option>
              <option value="verbose">Detailed / Technical</option>
              <option value="warm">Warm / Empathetic</option>
            </select>
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={userPersona.profile.prefers_depth}
                onChange={e => setUserPersona({
                  ...userPersona,
                  profile: { ...userPersona.profile, prefers_depth: e.target.checked }
                })}
              />
              <span>Prefers Deep Technical Explanations</span>
            </label>
          </div>
          <div className="form-group">
            <label>Tone Preference</label>
            <select
              value={userPersona.profile.tone_preference}
              onChange={e => setUserPersona({
                ...userPersona,
                profile: { ...userPersona.profile, tone_preference: e.target.value }
              })}
            >
              <option value="neutral">Neutral</option>
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="casual">Casual / Slang</option>
            </select>
          </div>
          <div className="form-group">
            <label>Active Goals / Interests (Tags)</label>
            <div className="dynamic-input">
              <input
                type="text"
                placeholder="Add a goal (e.g., Learn Rust, Build AI)"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = e.target.value.trim();
                    if (val && !userPersona.goals.includes(val)) {
                      setUserPersona({ ...userPersona, goals: [...userPersona.goals, val] });
                      e.target.value = "";
                    }
                  }
                }}
              />
            </div>
            <div className="goal-tags">
              {userPersona.goals.map((g, i) => (
                <span key={i} className="goal-tag">
                  {g} <span className="remove" onClick={() => setUserPersona({
                    ...userPersona,
                    goals: userPersona.goals.filter((_, idx) => idx !== i)
                  })}>×</span>
                </span>
              ))}
            </div>
          </div>
          <div className="forge-actions">
            <button className="save-btn" onClick={handleSaveUserProfile}>
              💾 Sync Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
