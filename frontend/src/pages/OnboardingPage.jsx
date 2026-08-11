// JoBoss feature:
// - F-02: Onboarding Flow (5-Step Wizard)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadResume, updateMyProfile, getMyProfile, createCheckoutSession, analyzeCV } from '../api';
import LocationInput from '../components/LocationInput';
import { JOB_CATEGORIES } from '../data/jobCategories';
import useTranslation from '../i18n/useTranslation';

const PLANS_LIST = [
  {
    key: 'FREE', nameKey: 'onb.plan.free', priceKey: 'onb.free', color: '#8B8299',
    features: ['onb.feat.5apply', 'onb.feat.noAi', 'onb.feat.noAuto'],
  },
  {
    key: 'PREMIUM', nameKey: 'onb.plan.premium', priceKey: 'onb.perMonth999',
    trialKey: 'onb.trial7', color: '#7C5CFF',
    features: ['onb.feat.unlimitedApply', 'onb.feat.10ai', 'Auto Apply ✓'],
  },
  {
    key: 'PREMIUM_PLUS', nameKey: 'onb.plan.premiumPlus', priceKey: 'onb.perMonth1999',
    trialKey: 'onb.trial7', color: '#FF5E8A', popular: true,
    features: ['onb.feat.unlimitedApply', 'onb.feat.unlimitedAi', 'Priority Matching ✓'],
  },
];

const EXP_LEVELS = ['סטודנט', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager'];
const AVAILABILITY = ['מיידי', 'תוך חודש', 'סתם מסתכל'];
// Persisted values stay Hebrew (ProfilePage validates them); only the visible
// label is translated.
const EXP_LABEL = { 'סטודנט': 'profile.exp.student' };
const AVAIL_LABEL = {
  'מיידי': 'profile.avail.immediate',
  'תוך חודש': 'profile.avail.month',
  'סתם מסתכל': 'profile.avail.browsing',
};

// Keys, not strings: this is module scope and cannot call t().
const STEP_TITLES = ['onb.step.plan', 'onb.step.cv', 'onb.step.roles', 'onb.step.settings', 'onb.step.done'];

const slideVariants = {
  enter: dir => ({ x: dir > 0 ? 280 : -280, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: dir => ({ x: dir > 0 ? -280 : 280, opacity: 0 }),
};

export default function OnboardingPage({ onComplete }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);

  const [plan, setPlan] = useState('FREE');
  const [existingResume, setExistingResume] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(80);
  const [expLevel, setExpLevel] = useState('');
  const [availability, setAvailability] = useState('');
  const [phone, setPhone] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [currentCompany, setCurrentCompany] = useState('');
  const [gender, setGender] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyProfile().then(data => {
      const u = data?.user;
      if (!u) return;
      if (u.preferredLocation) setLocation(u.preferredLocation);
      if (u.searchRadius) setRadius(Number(u.searchRadius));
      if (u.experienceLevel) setExpLevel(u.experienceLevel);
      if (u.availability) setAvailability(u.availability);
      if (u.phone) setPhone(u.phone);
      if (u.currentLocation) setCurrentLocation(u.currentLocation);
      if (u.currentCompany) setCurrentCompany(u.currentCompany);
      if (u.gender) setGender(u.gender);
      if (u.preferredRoles?.length) setSelectedRoles(u.preferredRoles);
      const active = u.resumes?.find(r => r.isActive) || u.resumes?.[0];
      if (active) { setExistingResume(active); setUploadDone(true); }
    }).catch(() => {});
  }, []);

  const saveStep = (currentStep) => {
    if (currentStep === 3 && selectedRoles.length > 0) {
      updateMyProfile({ preferredRoles: selectedRoles }).catch(() => {});
    } else if (currentStep === 4) {
      updateMyProfile({
        experienceLevel: expLevel,
        availability,
        ...(phone && { phone }),
        ...(currentLocation && { currentLocation }),
        ...(currentCompany && { currentCompany }),
        ...(gender && { gender }),
        ...(location && { preferredLocation: location, searchRadius: radius }),
        ...(lat && lng && { latitude: parseFloat(lat), longitude: parseFloat(lng) }),
        showAllJobs,
      }).catch(() => {});
    }
  };

  const go = d => {
    if (d > 0) saveStep(step);
    setDir(d);
    setStep(s => s + d);
  };

  const finish = async (forceFree = false) => {
    setSaving(true);
    try {
      await updateMyProfile({
        onboardingCompleted: true,
        preferredRoles: selectedRoles,
        experienceLevel: expLevel,
        availability,
        ...(phone && { phone }),
        ...(currentLocation && { currentLocation }),
        ...(currentCompany && { currentCompany }),
        ...(gender && { gender }),
        ...(location && { preferredLocation: location }),
        ...(radius && { searchRadius: radius }),
        ...(lat && { latitude: parseFloat(lat) }),
        ...(lng && { longitude: parseFloat(lng) }),
        showAllJobs,
      });
      localStorage.setItem('showAllJobs', showAllJobs);
      onComplete?.();
      if (!forceFree && plan !== 'FREE') {
        const { checkoutUrl } = await createCheckoutSession(plan);
        window.location.href = checkoutUrl;
      } else {
        navigate('/swipe');
      }
    } catch {
      navigate('/swipe');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async file => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await uploadResume(file);
      await updateMyProfile({
        resumeData: {
          resumeId: r.resumeId || `resume_${Date.now()}`,
          resumeUrl: r.resumeUrl,
          fileName: r.fileName || file.name,
          uploadedAt: r.uploadedAt || new Date().toISOString(),
        },
      });
      setExistingResume({ fileName: file.name, url: r.resumeUrl, isActive: true });
      setUploadDone(true);
      setAnalyzing(true);
      try {
        const a = await analyzeCV(r.resumeUrl);
        if (a?.suggestedRoles?.length) {
          setAiSuggestions(a.suggestedRoles);
          setSelectedRoles(prev => [...new Set([...prev, ...a.suggestedRoles.slice(0, 4)])]);
        }
        if (a?.experienceLevel) setExpLevel(a.experienceLevel);
      } catch {
        // silent — analysis is optional
      } finally {
        setAnalyzing(false);
      }
    } catch {
      alert(t('onb.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const toggleRole = r => setSelectedRoles(prev =>
    prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <img src="/app_logo.png" alt="joBoss" style={{ height: 38 }} />
        <span style={S.stepCounter}>{step} / 5</span>
      </div>

      {/* Progress */}
      <div style={S.progressWrap}>
        <div style={S.progressTrack}>
          <motion.div
            style={S.progressFill}
            animate={{ width: `${((step - 1) / 4) * 100}%` }}
            transition={{ type: 'spring', stiffness: 200 }}
          />
        </div>
        <div style={S.stepDots}>
          {STEP_TITLES.map((titleKey, i) => (
            <span key={i} style={{ ...S.dotLabel, color: i + 1 <= step ? '#7C5CFF' : '#D5CEE8', fontWeight: i + 1 === step ? 700 : 400 }}>
              {t(titleKey)}
            </span>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={S.contentWrap}>
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={S.stepInner}
          >
            {step === 1 && <PlanStep plan={plan} setPlan={setPlan} />}
            {step === 2 && (
              <CvStep
                existingResume={existingResume}
                uploading={uploading}
                analyzing={analyzing}
                uploadDone={uploadDone}
                onUpload={handleUpload}
              />
            )}
            {step === 3 && (
              <RolesStep
                aiSuggestions={aiSuggestions}
                selected={selectedRoles}
                onToggle={toggleRole}
              />
            )}
            {step === 4 && (
              <SettingsStep
                location={location}
                setLocation={setLocation}
                onCoords={(a, b) => { setLat(a); setLng(b); }}
                radius={radius}
                setRadius={setRadius}
                expLevel={expLevel}
                setExpLevel={setExpLevel}
                availability={availability}
                setAvailability={setAvailability}
                phone={phone}
                setPhone={setPhone}
                currentLocation={currentLocation}
                setCurrentLocation={setCurrentLocation}
                currentCompany={currentCompany}
                setCurrentCompany={setCurrentCompany}
                gender={gender}
                setGender={setGender}
                showAllJobs={showAllJobs}
                setShowAllJobs={setShowAllJobs}
              />
            )}
            {step === 5 && (
              <DoneStep plan={plan} roles={selectedRoles} location={location} expLevel={expLevel} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div style={S.bottomNav}>
        <button
          style={{ ...S.iconBtn, opacity: step === 1 ? 0.3 : 1 }}
          onClick={() => step > 1 && go(-1)}
          disabled={step === 1}
        >
          →
        </button>
        <button
          style={S.skipBtn}
          onClick={() => finish(true)}
          disabled={saving}
        >
          {t('onb.skip')}
        </button>
        {step < 5 ? (
          <button style={S.nextBtn} onClick={() => go(1)}>←</button>
        ) : (
          <button
            style={{ ...S.nextBtn, flex: 1, fontSize: 15 }}
            onClick={() => finish(false)}
            disabled={saving}
          >
            {saving ? '...' : plan !== 'FREE' ? t('onb.toPayment') : t('onb.start')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Plan selection ──────────────────────────────────────────────────

function PlanStep({ plan, setPlan }) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={T.h2}>{t('onb.welcome')}</h2>
      <p style={T.sub}>{t('onb.pickPlan')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {PLANS_LIST.map(p => (
          <div
            key={p.key}
            onClick={() => setPlan(p.key)}
            style={{
              borderRadius: 18, border: `2px solid ${plan === p.key ? p.color : '#EDE8FC'}`,
              background: plan === p.key ? `${p.color}14` : 'rgba(255,255,255,0.85)',
              padding: 16, cursor: 'pointer', position: 'relative',
            }}
          >
            {p.popular && (
              <div style={{ position: 'absolute', top: -10, right: 16, background: '#FF5E8A', color: 'white', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                {t('onb.popular')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: p.color }}>{t(p.nameKey)}</div>
                <div style={{ fontSize: 13, color: '#9A8FD0', marginTop: 2 }}>{t(p.priceKey)}</div>
                {p.trialKey && <div style={{ fontSize: 11, color: '#F5A623', marginTop: 2 }}>✨ {t(p.trialKey)}</div>}
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `2px solid ${p.color}`,
                background: plan === p.key ? p.color : 'transparent',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                color: 'white', fontSize: 13, flexShrink: 0, marginTop: 2,
              }}>
                {plan === p.key && '✓'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {p.features.map(f => (
                <span key={f} style={{ fontSize: 12, background: '#F5F3FC', padding: '3px 10px', borderRadius: 20, color: '#8B82B8' }}>{t(f)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: CV upload ───────────────────────────────────────────────────────

function CvStep({ existingResume, uploading, analyzing, uploadDone, onUpload }) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={T.h2}>{t('onb.cvTitle')}</h2>
      <p style={T.sub}>{t('onb.cvSub')}</p>
      {uploadDone && existingResume ? (
        <div style={{ background: '#EBFBF2', border: '1px solid #12A96F', borderRadius: 16, padding: 16, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: '#0E8A5F', fontSize: 15 }}>✅ {existingResume.fileName || t('onb.existingCv')}</div>
          <div style={{ fontSize: 13, color: '#4A4470', marginTop: 4 }}>{t('onb.changeInProfile')}</div>
          {analyzing && (
            <div style={{ fontSize: 12, color: '#7C5CFF', marginTop: 8, fontWeight: 600 }}>
              {t('onb.analysing')}
            </div>
          )}
          <label style={{ display: 'block', marginTop: 12, padding: '10px 16px', background: 'white', border: '1px dashed #7C5CFF', borderRadius: 12, cursor: 'pointer', textAlign: 'center', fontSize: 14, color: '#7C5CFF', fontWeight: 600 }}>
            {t('onb.replaceFile')}
            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => onUpload(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: '40px 24px', border: '2px dashed #7C5CFF', borderRadius: 20,
            background: '#F5F2FF', cursor: uploading ? 'wait' : 'pointer', textAlign: 'center',
          }}>
            {uploading ? (
              <>
                <div style={{ fontSize: 40 }}>⏳</div>
                <div style={{ fontWeight: 600, color: '#7C5CFF' }}>{t('onb.uploading')}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 56 }}>📎</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#7C5CFF' }}>{t('onb.clickUpload')}</div>
                <div style={{ fontSize: 13, color: '#C4BCE4' }}>{t('onb.max5mb')}</div>
              </>
            )}
            <input type="file" accept=".pdf" style={{ display: 'none' }} disabled={uploading} onChange={e => onUpload(e.target.files[0])} />
          </label>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#C4BCE4' }}>
            {t('onb.noCvPre')} {t('onb.next')} {t('onb.noCvPost')}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Role selection ──────────────────────────────────────────────────

function RolesStep({ aiSuggestions, selected, onToggle }) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 style={T.h2}>{t('onb.rolesQ')}</h2>
      <p style={T.sub}>{t('onb.pickOneOrMore')}</p>

      {aiSuggestions.length > 0 && (
        <div style={{ margin: '12px 0', background: '#F1ECFF', borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', marginBottom: 10 }}>{t('onb.aiSuggests')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {aiSuggestions.map(r => (
              <button key={r} onClick={() => onToggle(r)} style={roleTag(selected.includes(r), true)}>
                {r} {selected.includes(r) ? '✓' : '+'}
              </button>
            ))}
          </div>
        </div>
      )}

      {JOB_CATEGORIES.map(cat => (
        <div key={cat.group} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#8B82B8', marginBottom: 8 }}>
            {cat.icon} {cat.group}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cat.roles.map(r => {
              const isSuggested = aiSuggestions.includes(r);
              return (
                <button key={r} onClick={() => onToggle(r)} style={roleTag(selected.includes(r), isSuggested)}>
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected.length > 0 && (
        <div style={{ fontSize: 13, color: '#7C5CFF', fontWeight: 600, paddingTop: 8 }}>
          {t('onb.selectedPrefix')} {selected.length} {t('onb.selectedRoles')}
        </div>
      )}
    </div>
  );
}

function roleTag(isSelected, isSuggested) {
  return {
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: isSelected || isSuggested ? 600 : 400,
    border: `1px solid ${isSelected ? '#7C5CFF' : isSuggested ? '#C9BBFF' : '#EDE8FC'}`,
    background: isSelected ? '#7C5CFF' : isSuggested ? '#F1ECFF' : 'white',
    color: isSelected ? 'white' : isSuggested ? '#7C5CFF' : '#8B82B8',
  };
}

// ── Step 4: Settings ────────────────────────────────────────────────────────

function SettingsStep({ location, setLocation, onCoords, radius, setRadius, expLevel, setExpLevel, availability, setAvailability, phone, setPhone, currentLocation, setCurrentLocation, currentCompany, setCurrentCompany, gender, setGender, showAllJobs, setShowAllJobs }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={T.h2}>{t('onb.basicSettings')}</h2>
        <p style={T.sub}>{t('onb.autofillNote')}</p>
      </div>

      <div>
        <div style={T.label}>{t('onb.phone')}</div>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="050-1234567"
          dir="ltr"
          style={textInput}
        />
      </div>

      <div>
        <div style={T.label}>{t('onb.currentCity')}</div>
        <input
          type="text"
          value={currentLocation}
          onChange={e => setCurrentLocation(e.target.value)}
          placeholder={t('onb.telAviv')}
          style={textInput}
        />
      </div>

      <div>
        <div style={T.label}>{t('onb.currentCompany')} <span style={{ fontWeight: 400, color: '#C4BCE4', fontSize: 13 }}>{t('onb.optional')}</span></div>
        <input
          type="text"
          value={currentCompany}
          onChange={e => setCurrentCompany(e.target.value)}
          placeholder={t('onb.companyName')}
          style={textInput}
        />
      </div>

      <div>
        <div style={T.label}>{t('onb.gender')} <span style={{ fontWeight: 400, color: '#C4BCE4', fontSize: 13 }}>{t('onb.optional')}</span></div>
        <select
          value={gender}
          onChange={e => setGender(e.target.value)}
          style={textInput}
        >
          <option value="">{t('onb.choose')}</option>
          <option value="Male">{t('onb.male')}</option>
          <option value="Female">{t('onb.female')}</option>
          <option value="Prefer not to say">{t('onb.preferNot')}</option>
        </select>
      </div>

      <div>
        <div style={T.label}>{t('onb.preferredLocation')}</div>
        <div style={{ marginTop: 8 }}>
          <LocationInput value={location} onChange={setLocation} onCoordinates={onCoords} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={T.label}>{t('onb.radius')}</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#7C5CFF', background: '#F1ECFF', padding: '3px 12px', borderRadius: 20 }}>{radius} ק"מ</span>
        </div>
        <input
          type="range" min={5} max={100} step={5} value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#7C5CFF', marginTop: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#D5CEE8' }}>{t('common.km5')}</span>
          <span style={{ fontSize: 11, color: '#D5CEE8' }}>{t('common.km100')}</span>
        </div>
      </div>

      <div>
        <div style={T.label}>{t('onb.expLevel')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {EXP_LEVELS.map(l => (
            <button key={l} onClick={() => setExpLevel(l)} style={chipBtn(expLevel === l)}>{EXP_LABEL[l] ? t(EXP_LABEL[l]) : l}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={T.label}>{t('onb.availability')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {AVAILABILITY.map(a => (
            <button key={a} onClick={() => setAvailability(a)} style={chipBtn(availability === a)}>{AVAIL_LABEL[a] ? t(AVAIL_LABEL[a]) : a}</button>
          ))}
        </div>
      </div>

      <div style={{ background: '#F8F6FF', borderRadius: 16, padding: '16px', border: '1px solid #E9E4FB' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...T.label, marginBottom: 4 }}>{t('onb.showAllJobs')}</div>
            <div style={{ fontSize: 13, color: '#8B82B8', lineHeight: 1.5 }}>
              {showAllJobs
                ? t('onb.showAllOn')
                : t('onb.showAllOff')}
            </div>
            {showAllJobs && (
              <div style={{ fontSize: 11, color: '#F5A623', marginTop: 4 }}>
                {t('onb.showAllWarn')}
              </div>
            )}
          </div>
          <div
            onClick={() => setShowAllJobs(v => !v)}
            style={{ width: 46, height: 26, borderRadius: 13, flexShrink: 0, cursor: 'pointer', position: 'relative',
                     background: showAllJobs ? '#7C5CFF' : '#DDD6F2', transition: 'background 0.2s', marginTop: 2 }}
          >
            <div style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: 'white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                          left: showAllJobs ? 23 : 3 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const textInput = {
  width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid #E9E4FB', background: '#F8F6FF', fontSize: 15, color: '#1E2A4A',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function chipBtn(active) {
  return {
    padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 14,
    border: `1px solid ${active ? '#7C5CFF' : '#EDE8FC'}`,
    background: active ? '#7C5CFF' : 'white',
    color: active ? 'white' : '#8B82B8',
    fontWeight: active ? 700 : 400,
  };
}

// ── Step 5: Done ────────────────────────────────────────────────────────────

function DoneStep({ plan, roles, location, expLevel }) {
  const { t } = useTranslation();
  const planNames = { FREE: t('onb.plan.free'), PREMIUM: t('onb.plan.premium'), PREMIUM_PLUS: t('onb.plan.premiumPlus') };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20, paddingTop: 12 }}>
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
        style={{ fontSize: 80 }}
      >
        🎉
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h2 style={{ ...T.h2, textAlign: 'center' }}>{t('onb.allSet')}</h2>
        <p style={{ ...T.sub, textAlign: 'center' }}>{t('onb.summary')}</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ width: '100%', background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 10px 28px rgba(108,79,212,0.14)', textAlign: 'right' }}
      >
        {[
          [t('onb.planTitle'), planNames[plan] || plan],
          roles.length > 0 && [t('onb.rolesTitle'), roles.slice(0, 3).join(', ') + (roles.length > 3 ? ` +${roles.length - 3}` : '')],
          location && [t('onb.locationTitle'), location.split(',')[0]],
          expLevel && [t('onb.expTitle'), expLevel],
        ].filter(Boolean).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0FC' }}>
            <span style={{ fontSize: 14, color: '#8B82B8', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 14, color: '#1E2A4A', fontWeight: 600, maxWidth: '55%', textAlign: 'left' }}>{value}</span>
          </div>
        ))}
      </motion.div>
      {plan !== 'FREE' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{ fontSize: 13, color: '#7C5CFF', background: '#F1ECFF', padding: '10px 16px', borderRadius: 12, fontWeight: 600, width: '100%', textAlign: 'center' }}
        >
          {t('onb.payPre')} {t('onb.pay')} {t('onb.payPost')} {planNames[plan]}
        </motion.div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh', background: 'linear-gradient(165deg, #F5F2FF 0%, #ECE6FF 45%, #F8F0FF 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', direction: 'inherit',
  },
  header: {
    width: '100%', maxWidth: 480, padding: '20px 24px 0',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  stepCounter: { fontSize: 13, color: '#C4BCE4', fontWeight: 600 },
  progressWrap: { width: '100%', maxWidth: 480, padding: '14px 24px 0' },
  progressTrack: { height: 6, background: '#E9E4FB', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #7C5CFF, #FF5E8A)', borderRadius: 3 },
  stepDots: { display: 'flex', justifyContent: 'space-between', marginTop: 6 },
  dotLabel: { fontSize: 10 },
  contentWrap: { flex: 1, width: '100%', maxWidth: 480, overflow: 'hidden', position: 'relative' },
  stepInner: { padding: '20px 24px 130px' },
  bottomNav: {
    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: 480,
    background: 'white', borderTop: '1px solid #F3F0FC',
    padding: '12px 24px 24px',
    display: 'flex', gap: 10, direction: 'inherit',
  },
  iconBtn: {
    padding: '12px 18px', borderRadius: 12, border: 'none',
    background: '#F5F3FC', color: '#8B82B8', fontSize: 18, fontWeight: 700, cursor: 'pointer',
  },
  skipBtn: {
    flex: 1, padding: '12px', borderRadius: 12,
    background: 'transparent', color: '#C4BCE4',
    border: '1px solid #EDE8FC', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  nextBtn: {
    padding: '12px 22px', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)',
    color: 'white', fontSize: 18, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(91,61,245,0.3)',
  },
};

const T = {
  h2: { fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: '#1E2A4A' },
  sub: { fontSize: 14, color: '#8B82B8', margin: '0 0 4px' },
  label: { fontSize: 15, fontWeight: 700, color: '#1E2A4A' },
};
