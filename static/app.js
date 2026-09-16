const health = document.querySelector('#health');
const textInput = document.querySelector('#clinical-text');
const analyzeButton = document.querySelector('#analyze-button');
const termResults = document.querySelector('#term-results');
const diseaseResults = document.querySelector('#disease-results');
const feedback = document.querySelector('#feedback');
const refractory = document.querySelector('#refractory');
const patientAge = document.querySelector('#patient-age');
const patientSex = document.querySelector('#patient-sex');
const signals = document.querySelector('#signals');
const additionalText = document.querySelector('#additional-text');
const absentText = document.querySelector('#absent-text');
const differential = document.querySelector('#differential');
const profileSelect = document.querySelector('#profile-select');
const profileResults = document.querySelector('#profile-results');
const exportButton = document.querySelector('#export-button');
const inputPanelState = document.querySelector('.input-panel .panel-state');
const resultsPanelState = document.querySelector('.results-panel .panel-state');
const hpoForm = document.querySelector('#hpo-form');
const hpoQuery = document.querySelector('#hpo-query');
const hpoResults = document.querySelector('#hpo-results');
const builderPreview = document.querySelector('#builder-preview');
const builderUse = document.querySelector('#builder-use');
const reviewContinue = document.querySelector('#review-continue');
const wizardPages = [...document.querySelectorAll('[data-wizard-page]')];
const wizardControls = [...document.querySelectorAll('.workflow [data-wizard-go]')];
const guidedDemo = document.querySelector('#guided-demo');
const guidedDemoIndex = document.querySelector('#guided-demo-index');
const guidedDemoTitle = document.querySelector('#guided-demo-title');
const guidedDemoCopy = document.querySelector('#guided-demo-copy');
const guidedDemoNext = document.querySelector('#guided-demo-next');
const noteCheckText = document.querySelector('#note-check-text');
const noteCheckResults = document.querySelector('#note-check-results');
const noteCheckSend = document.querySelector('#note-check-send');
const questionBuild = document.querySelector('#question-build');
const questionHint = document.querySelector('#question-hint');
const questionOutput = document.querySelector('#question-output');
const questionList = document.querySelector('#question-list');

const excludedTermIds = new Set();
let latestAnalysis = null;
let latestInput = null;
let pendingDemo = null;
let isStale = false;
let guidedDemoActive = false;
let reviewConfirmed = false;
const caseStatus = document.querySelector('#case-status');
const resultTools = document.querySelector('#result-tools');
const comparison = document.querySelector('#comparison');
const formControls = [textInput, additionalText, absentText, patientAge, patientSex, refractory];
const demos = {
  connective: {name: 'Connective tissue', text: 'Patient has joint pain, hypertelorism and skin laxity.'},
  neuro: {name: 'Neurological', text: 'Patient has developmental delay, seizures and hypotonia.'},
  skeletal: {name: 'Skeletal', text: 'Patient has short stature, scoliosis and brachydactyly.'},
};

function setStep(index, {scroll = false} = {}) {
  wizardPages.forEach(page => { page.hidden = Number(page.dataset.wizardPage) !== index; });
  wizardControls.forEach((control, i) => {
    if (i === index) control.setAttribute('aria-current', 'step');
    else control.removeAttribute('aria-current');
  });
  renderGuidedDemo(index);
  if (scroll) {
    const scrollTarget = !guidedDemo.hidden ? guidedDemo : document.querySelector('.workspace');
    scrollTarget.scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start'});
  }
}

function updateWizardAccess() {
  wizardControls[1].disabled = !latestAnalysis;
  wizardControls[2].disabled = !reviewConfirmed || !latestAnalysis?.diseases.length || isStale;
}

function renderGuidedDemo(index) {
  if (!guidedDemoActive || !latestAnalysis || index === 0) {
    guidedDemo.hidden = true;
    return;
  }

  guidedDemo.hidden = false;
  guidedDemoNext.hidden = false;
  if (index === 1) {
    guidedDemoIndex.textContent = 'Demo 1 / 2';
    guidedDemoTitle.textContent = 'Notice made the note reviewable.';
    guidedDemoCopy.textContent = `${latestAnalysis.terms.length} phrases were translated into standardized HPO terms. Check them, then continue.`;
    guidedDemoNext.innerHTML = 'See the candidate evidence <span aria-hidden="true">→</span>';
  } else {
    guidedDemoIndex.textContent = 'Demo 2 / 2';
    guidedDemoTitle.textContent = 'The shortlist shows its work.';
    guidedDemoCopy.textContent = `${latestAnalysis.diseases.length} candidate profiles are ranked by similarity—not probability. Open a result or compare the top three.`;
    guidedDemoNext.innerHTML = 'Compare the top three <span aria-hidden="true">→</span>';
  }
}

function setResultsView(compare) {
  comparison.hidden = !compare;
  diseaseResults.hidden = compare;
  document.querySelector('#view-list').setAttribute('aria-pressed', String(!compare));
  document.querySelector('#view-compare').setAttribute('aria-pressed', String(compare));
  if (compare) setStep(2);
}

function renderComparison(data) {
  const candidates = data.diseases.slice(0, 3);
  comparison.innerHTML = `<table><caption>Which findings do the leading candidates share? “Not listed” means the finding is not annotated in that profile; it does not rule out the disease.</caption>
    <thead><tr><th scope="col">Case finding</th>${candidates.map(d => `<th scope="col">${escapeHtml(d.name)}<small>${escapeHtml(d.id)}</small></th>`).join('')}</tr></thead>
    <tbody>${data.terms.map(term => `<tr><th scope="row">${escapeHtml(term.name)}</th>${candidates.map(d => `<td>${d.matched_terms.some(t => t.id === term.id) ? '✓ Matched' : 'Not listed'}</td>`).join('')}</tr>`).join('')}
    <tr><th scope="row">Similarity score</th>${candidates.map(d => `<td>${(d.score * 100).toFixed(1)}</td>`).join('')}</tr>
    <tr><th scope="row">Conflicts to review</th>${candidates.map(d => `<td>${d.flags.length ? d.flags.map(escapeHtml).join('; ') : 'None flagged'}</td>`).join('')}</tr></tbody></table>`;
}

function markEdited() {
  document.querySelector('#note-count').textContent = `${textInput.value.length.toLocaleString()} / 10,000`;
  reviewConfirmed = false;
  setStep(0);
  if (!latestAnalysis) {
    updateWizardAccess();
    return;
  }
  isStale = true;
  exportButton.hidden = true;
  feedback.hidden = true;
  caseStatus.classList.add('stale');
  caseStatus.textContent = 'Case changed. The displayed results belong to the previous analysis. Run again to update them.';
  resultsPanelState.textContent = 'Needs update';
  updateWizardAccess();
}

function markReviewEdited() {
  if (!latestAnalysis) return;
  reviewConfirmed = false;
  isStale = true;
  exportButton.hidden = true;
  feedback.hidden = true;
  caseStatus.classList.add('stale');
  caseStatus.textContent = 'Review options changed. Continue to refresh the candidate profiles.';
  resultsPanelState.textContent = 'Needs update';
  updateWizardAccess();
}

async function loadDemo(key) {
  const demo = demos[key];
  pendingDemo = null;
  document.querySelector('#demo-confirm').hidden = true;
  textInput.value = demo.text;
  additionalText.value = '';
  absentText.value = '';
  patientAge.value = '';
  patientSex.value = 'unknown';
  refractory.checked = false;
  excludedTermIds.clear();
  markEdited();
  document.querySelector('#analysis').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  await analyze(1);
  if (latestAnalysis) caseStatus.textContent = `Fictional example: ${demo.name}. ${latestAnalysis.terms.length} findings extracted. Review them, then continue to candidates.`;
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-demo]');
  if (!button || analyzeButton.disabled) return;
  guidedDemoActive = button.hasAttribute('data-guided-demo');
  const key = button.dataset.demo;
  if (!demos[key]) return;
  if (formControls.some(control => control.type === 'checkbox' ? control.checked : control === patientSex ? control.value !== 'unknown' : control.value.trim())) {
    pendingDemo = key;
    document.querySelector('#demo-confirm').hidden = false;
    document.querySelector('#demo-confirm').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center'});
    document.querySelector('#demo-replace').focus({preventScroll: true});
  } else loadDemo(key);
});
document.querySelector('#demo-replace').addEventListener('click', () => { if (pendingDemo && !analyzeButton.disabled) loadDemo(pendingDemo); });
document.querySelector('#demo-cancel').addEventListener('click', () => { pendingDemo = null; guidedDemoActive = false; document.querySelector('#demo-confirm').hidden = true; });
document.querySelector('#view-list').addEventListener('click', () => setResultsView(false));
document.querySelector('#view-compare').addEventListener('click', () => setResultsView(true));
textInput.addEventListener('input', markEdited);
[absentText, patientAge, patientSex, refractory].forEach(control => control.addEventListener('input', markReviewEdited));

const hero = document.querySelector('.hero');
const signalBoard = document.querySelector('.signal-board');
const appHeader = document.querySelector('.app-header');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function syncHeader() {
  appHeader?.classList.toggle('scrolled', window.scrollY > 18);
  let section = '#top';
  ['#top', '#analysis', '#how-it-works', '#tools'].forEach(id => {
    if (document.querySelector(id)?.getBoundingClientRect().top <= 220) section = id;
  });
  document.querySelectorAll('.main-nav a, .mobile-tabs a').forEach(link => {
    const active = link.getAttribute('href') === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

syncHeader();
window.addEventListener('scroll', syncHeader, {passive: true});
document.addEventListener('click', event => {
  const control = event.target.closest('[data-wizard-go]');
  if (!control || control.disabled) return;
  setStep(Number(control.dataset.wizardGo), {scroll: true});
});

if (hero && signalBoard && !reducedMotion.matches) {
  let motionFrame = 0;

  hero.addEventListener('pointermove', event => {
    window.cancelAnimationFrame(motionFrame);
    motionFrame = window.requestAnimationFrame(() => {
      const heroBounds = hero.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - heroBounds.left) / heroBounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - heroBounds.top) / heroBounds.height));
      hero.style.setProperty('--pointer-x', `${(x * 100).toFixed(1)}%`);
      hero.style.setProperty('--pointer-y', `${(y * 100).toFixed(1)}%`);
      signalBoard.style.setProperty('--board-rx', `${((.5 - y) * 2.2).toFixed(2)}deg`);
      signalBoard.style.setProperty('--board-ry', `${((x - .5) * 2.8).toFixed(2)}deg`);
    });
  });

  hero.addEventListener('pointerleave', () => {
    signalBoard.style.setProperty('--board-rx', '0deg');
    signalBoard.style.setProperty('--board-ry', '0deg');
  });
}

if (!reducedMotion.matches) {
  document.documentElement.classList.add('motion-enabled');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in-view');
      revealObserver.unobserve(entry.target);
    });
  }, {threshold: .12, rootMargin: '0px 0px -40px'});
  document.querySelectorAll('.section-reveal, .reveal-item').forEach(element => revealObserver.observe(element));

  document.querySelectorAll('[data-count]').forEach(element => {
    const total = Number(element.dataset.count);
    if (!total) return;
    const duration = 1100;
    const started = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(total * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
} else {
  document.querySelectorAll('.section-reveal, .reveal-item').forEach(element => element.classList.add('in-view'));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

async function searchHpo() {
  const query = hpoQuery.value.trim();
  if (!query) {
    hpoResults.innerHTML = '<p class="hpo-message">Enter a clinical phrase such as “joint pain” or an HPO ID.</p>';
    hpoQuery.focus();
    return;
  }

  const searchButton = hpoForm.querySelector('button[type="submit"]');
  searchButton.disabled = true;
  searchButton.firstChild.textContent = 'Searching ';
  hpoResults.innerHTML = '<p class="hpo-message">Searching the local ontology…</p>';
  try {
    const data = await requestJson(`/api/phenotypes/search?q=${encodeURIComponent(query)}`);
    hpoResults.innerHTML = data.results.length
      ? data.results.map(term => `<article class="hpo-result"><strong>${escapeHtml(term.name)}</strong><code>${escapeHtml(term.id)}</code><small>${Math.round(term.score)}% match</small></article>`).join('')
      : '<p class="hpo-message">No confident match. Try a shorter, more specific phenotype phrase.</p>';
  } catch (error) {
    hpoResults.innerHTML = `<p class="hpo-message">${escapeHtml(error.message)}</p>`;
  } finally {
    searchButton.disabled = false;
    searchButton.firstChild.textContent = 'Search ';
  }
}

hpoForm?.addEventListener('submit', event => {
  event.preventDefault();
  searchHpo();
});
hpoResults?.addEventListener('click', event => {
  const suggestion = event.target.closest('[data-hpo-query]');
  if (!suggestion) return;
  hpoQuery.value = suggestion.dataset.hpoQuery;
  searchHpo();
});

const builderFindings = new Set();
const builderAbsent = new Set();

function listPhrase(items) {
  if (items.length < 2) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function updateBuilder() {
  const observed = [...builderFindings];
  const absent = [...builderAbsent];
  builderUse.disabled = !observed.length;
  builderPreview.textContent = observed.length
    ? `Patient has ${listPhrase(observed)}.${absent.length ? ` Explicitly absent: ${listPhrase(absent)}.` : ''}`
    : 'Choose at least one observed finding.';
}

document.querySelector('.builder-tool')?.addEventListener('click', event => {
  const button = event.target.closest('[data-builder-finding], [data-builder-absent]');
  if (!button) return;
  const isAbsent = button.hasAttribute('data-builder-absent');
  const value = isAbsent ? button.dataset.builderAbsent : button.dataset.builderFinding;
  const targetSet = isAbsent ? builderAbsent : builderFindings;
  const otherSet = isAbsent ? builderFindings : builderAbsent;
  if (targetSet.has(value)) targetSet.delete(value);
  else {
    targetSet.add(value);
    otherSet.delete(value);
    document.querySelectorAll(`[data-builder-finding="${value}"], [data-builder-absent="${value}"]`).forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
  }
  button.setAttribute('aria-pressed', String(targetSet.has(value)));
  updateBuilder();
});

builderUse?.addEventListener('click', () => {
  if (!builderFindings.size) return;
  textInput.value = `Patient has ${listPhrase([...builderFindings])}.`;
  additionalText.value = '';
  absentText.value = [...builderAbsent].join(', ');
  excludedTermIds.clear();
  markEdited();
  history.pushState(null, '', '#analysis');
  setStep(0);
  document.querySelector('#analysis').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  setTimeout(() => textInput.focus({preventScroll: true}), reducedMotion.matches ? 0 : 500);
});

function runNoteCheck() {
  const text = noteCheckText.value.trim();
  if (!text) {
    noteCheckResults.innerHTML = '<p class="note-check-message">Paste a note first, or use the workspace note.</p>';
    noteCheckSend.disabled = true;
    return;
  }

  const phrases = text.split(/[,;\n.]|\band\b/i).map(item => item.trim()).filter(item => item.length > 2);
  const hasUncertainty = /\b(possible|possibly|maybe|suspected|might|could be|rule out)\b/i.test(text);
  const hasNegation = /\b(no|not|without|denies|negative for|absent)\b/i.test(text);
  const checks = [
    {pass: phrases.length >= 2, title: `${phrases.length} potential finding${phrases.length === 1 ? '' : 's'} detected`, copy: phrases.length >= 2 ? 'There is enough detail to attempt phenotype extraction.' : 'Add another specific observation if one is available.'},
    {pass: !hasUncertainty, title: hasUncertainty ? 'Uncertain language found' : 'No uncertain language detected', copy: hasUncertainty ? 'Notice ignores some phrases such as “possible” or “suspected.” Record confirmed observations when possible.' : 'The note reads as observed findings rather than guesses.'},
    {pass: !hasNegation, title: hasNegation ? 'Negative language needs review' : 'No embedded negatives detected', copy: hasNegation ? 'Move findings confirmed not present into the separate absent-findings field during step 2.' : 'No obvious absent findings are mixed into the observed note.'},
  ];
  noteCheckResults.innerHTML = checks.map(check => `<div class="note-check-row ${check.pass ? 'pass' : 'warn'}"><b>${check.pass ? '✓' : '!'}</b><span><strong>${escapeHtml(check.title)}</strong>${escapeHtml(check.copy)}</span></div>`).join('');
  noteCheckSend.disabled = false;
}

document.querySelector('#note-check-run')?.addEventListener('click', runNoteCheck);
document.querySelector('#note-check-current')?.addEventListener('click', () => {
  noteCheckText.value = textInput.value;
  runNoteCheck();
});
noteCheckText?.addEventListener('input', () => { noteCheckSend.disabled = !noteCheckText.value.trim(); });
noteCheckSend?.addEventListener('click', () => {
  textInput.value = noteCheckText.value.trim();
  excludedTermIds.clear();
  markEdited();
  history.pushState(null, '', '#analysis');
  setStep(0);
  document.querySelector('#analysis').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'});
});

function refreshQuestionBuilder() {
  const top = reviewConfirmed ? latestAnalysis?.diseases?.[0] : null;
  questionBuild.disabled = !top;
  questionHint.textContent = top
    ? `Ready to build questions around ${top.name}.`
    : 'Run an analysis to unlock focused questions.';
  questionOutput.hidden = true;
  document.querySelector('#question-status').textContent = '';
}

questionBuild?.addEventListener('click', () => {
  const top = latestAnalysis?.diseases?.[0];
  if (!top) return;
  const missing = (top.missing_term_ids || []).slice(0, 2).map(term => term.name);
  const questions = [
    `Which findings would most help distinguish ${top.name} from the other candidates?`,
    missing.length
      ? `Should ${listPhrase(missing)} be specifically assessed or documented?`
      : 'Are there additional findings that should be specifically assessed or documented?',
    'What testing or specialist review would be appropriate before drawing any conclusion?',
    'Could family history, age of onset, or symptom progression materially change this ranking?',
    `Which alternative candidate best explains findings that ${top.name} may not account for?`,
  ];
  questionList.innerHTML = questions.map(question => `<li>${escapeHtml(question)}</li>`).join('');
  questionOutput.hidden = false;
});

document.querySelector('#question-copy')?.addEventListener('click', async () => {
  const text = [...questionList.querySelectorAll('li')].map((item, index) => `${index + 1}. ${item.textContent}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector('#question-status').textContent = 'Questions copied.';
  } catch {
    document.querySelector('#question-status').textContent = 'Copy unavailable in this browser.';
  }
});

document.addEventListener('click', event => {
  const action = event.target.closest('[data-results-action]')?.dataset.resultsAction;
  if (!action) return;
  event.preventDefault();
  if (!reviewConfirmed || !latestAnalysis) {
    setStep(latestAnalysis ? 1 : 0);
    caseStatus.textContent = 'Complete all three workspace steps to unlock the review tools.';
    return;
  }
  if (action === 'brief') {
    exportButton.click();
    return;
  }
  setStep(2, {scroll: true});
  if (action === 'compare') setResultsView(true);
  if (action === 'evidence') {
    setResultsView(false);
    const first = diseaseResults.querySelector('.disease');
    if (first) first.open = true;
  }
});

function showError(element, message) {
  element.className = 'results empty';
  element.innerHTML = `<div class="error-state"><span aria-hidden="true">!</span><div><strong>Something needs attention</strong><p>${escapeHtml(message)}</p></div></div>`;
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  formControls.forEach(control => { control.disabled = isLoading; });
  document.querySelectorAll('[data-demo], .remove-term, #demo-replace').forEach(button => { button.disabled = isLoading; });
  reviewContinue.disabled = isLoading;
  analyzeButton.querySelector('span').textContent = isLoading ? 'Extracting findings…' : 'Continue to review';
  reviewContinue.querySelector('span').textContent = isLoading ? 'Updating candidates…' : 'See candidate profiles';
  document.querySelector('.workspace').setAttribute('aria-busy', String(isLoading));
}

function resetSecondaryResults() {
  latestAnalysis = null;
  latestInput = null;
  reviewConfirmed = false;
  resultTools.hidden = true;
  setResultsView(false);
  comparison.replaceChildren();
  signals.hidden = true;
  differential.hidden = true;
  feedback.hidden = true;
  exportButton.hidden = true;
  profileResults.replaceChildren();
  profileSelect.innerHTML = '<option value="">Choose a candidate to compare…</option>';
  refreshQuestionBuilder();
}

requestJson('/api/health')
  .then(data => {
    const diseaseStatus = data.hpoa_available
      ? `${data.disease_profiles.toLocaleString()} disease profiles`
      : 'disease ranking unavailable';
    health.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${data.hpo_terms.toLocaleString()} HPO terms · ${diseaseStatus}`;
  })
  .catch(() => {
    health.innerHTML = '<span class="status-dot unavailable" aria-hidden="true"></span>Service unavailable';
  });

function renderTerms(terms) {
  termResults.className = 'results term-list';
  termResults.innerHTML = terms.length
    ? terms.map(term => `
      <div class="term-chip">
        <span class="term-copy">
          <strong>${escapeHtml(term.name)}</strong>
          <small>${escapeHtml(term.id)}</small>
        </span>
        <button class="remove-term" type="button" data-remove-term="${escapeHtml(term.id)}" title="Remove ${escapeHtml(term.name)}" aria-label="Remove ${escapeHtml(term.name)}">×</button>
      </div>`).join('')
    : '<div class="empty-state compact"><span class="empty-glyph" aria-hidden="true">HPO</span><span>No confident HPO terms found. Try a more specific description.</span></div>';
}

function renderDiseases(diseases, hpoaAvailable) {
  diseaseResults.className = 'results disease-list';
  if (!hpoaAvailable) {
    diseaseResults.innerHTML = '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">HPOA</span><strong>Disease ranking unavailable</strong><span>Add data/phenotype.hpoa to enable profile matching.</span></div>';
    return;
  }
  if (!diseases.length) {
    diseaseResults.innerHTML = '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">0</span><strong>No profiles matched</strong><span>Review the extracted phenotypes or add a more specific finding.</span></div>';
    return;
  }

  diseaseResults.innerHTML = diseases.map((disease, index) => {
    const matched = disease.matched_terms.map(term => escapeHtml(term.name)).join(', ');
    const missing = disease.missing_term_ids.map(term => escapeHtml(term.name)).join(', ') || 'None listed';
    const absent = disease.absent_expected.map(term => escapeHtml(term.name)).join(', ') || 'None reported';
    const flags = disease.flags.map(escapeHtml).join(', ') || 'None';
    const weighting = disease.matched_breakdown.map(term => {
      const reference = term.reference ? `; ${escapeHtml(term.reference)}` : '';
      return `${escapeHtml(term.name)} (${escapeHtml(term.frequency || 'not reported')}; x${escapeHtml(term.frequency_factor)}; ${escapeHtml(term.evidence || 'evidence not reported')}${reference})`;
    }).join(', ');

    return `
      <details class="disease" ${index === 0 ? 'open' : ''}>
        <summary>
          <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
          <span class="disease-heading"><strong>${escapeHtml(disease.name)}</strong><small>${escapeHtml(disease.id)}</small></span>
          <span class="score-badge" title="Weighted phenotype similarity, not disease probability"><small>Similarity</small><b>${(disease.score * 100).toFixed(1)}</b></span>
          <span class="chevron" aria-hidden="true"></span>
        </summary>
        <div class="evidence">
          <p class="why-ranked">${escapeHtml(disease.why_ranked)}</p>
          <div class="evidence-grid">
            <div class="evidence-block"><span>Matched findings</span><p>${matched}</p></div>
            <div class="evidence-block"><span>Not reported in this case</span><p>${missing}</p></div>
            <div class="evidence-block"><span>Explicitly absent</span><p>${absent}</p></div>
            <div class="evidence-block"><span>Ranking flags</span><p>${flags}</p></div>
          </div>
          <div class="clinical-meta">
            <div><span>Suggested specialist</span><p>${escapeHtml(disease.specialty)}</p></div>
            <div><span>Inheritance note</span><p>${escapeHtml(disease.inheritance)}</p></div>
          </div>
          <details class="scoring-details">
            <summary>View scoring evidence</summary>
            <p>${weighting}</p>
          </details>
          <div class="resource-links">
            <a class="resource-link" href="${escapeHtml(disease.resources.GARD)}" target="_blank" rel="noreferrer">GARD <span aria-hidden="true">↗</span></a>
            <a class="resource-link" href="${escapeHtml(disease.resources.NORD)}" target="_blank" rel="noreferrer">NORD <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </details>`;
  }).join('');
}

function renderSignals(data) {
  const labels = data.signals.systems.map(system => (
    system.replace(/^./, letter => letter.toUpperCase())
  ));
  signals.hidden = !data.signals.multi_system && !data.signals.refractory;
  signals.innerHTML = data.signals.multi_system
    ? `<span class="signal-icon" aria-hidden="true">!</span><div><strong>Multi-system presentation</strong><span>Findings span ${labels.map(escapeHtml).join(', ')}${data.signals.refractory ? ' and persisted despite treatment' : ''}. Consider genetics review.</span></div>`
    : data.signals.refractory
      ? '<span class="signal-icon" aria-hidden="true">↻</span><div><strong>Persistent presentation</strong><span>Symptoms persisted despite treatment. A broader evaluation may be appropriate.</span></div>'
      : '';
}

function renderProfile(disease) {
  if (!disease) {
    profileResults.replaceChildren();
    return;
  }
  profileResults.innerHTML = `
    <p class="profile-note">Up to 30 annotated findings from this profile. Matched findings are labeled; unreported findings are not automatically absent.</p>
    ${disease.expected_terms.map(term => `
      <div class="profile-term">
        <b>${disease.matched_terms.some(matched => matched.id === term.id) ? '✓ Matched' : 'Unreported'}</b>
        <span>${escapeHtml(term.name)} <small>${escapeHtml(term.id)}</small></span>
      </div>`).join('')}`;
}

async function analyze(destination = 1) {
  if (analyzeButton.disabled) return;
  const text = textInput.value.trim();
  if (!text) {
    showError(termResults, 'Enter a clinical description first.');
    textInput.focus();
    return;
  }

  setLoading(true);
  inputPanelState.textContent = 'Extracting';
  resultsPanelState.textContent = 'Ranking';
  resetSecondaryResults();
  caseStatus.classList.remove('stale');
  caseStatus.textContent = 'Extracting findings and comparing local disease annotations…';
  setStep(1);
  termResults.className = 'results empty';
  diseaseResults.className = 'results disease-list empty';
  termResults.innerHTML = '<div class="loading-state compact"><span></span><div><i></i><i></i></div></div>';
  diseaseResults.innerHTML = Array.from({length: 4}, () => '<div class="loading-state"><span></span><div><i></i><i></i></div><b></b></div>').join('');

  try {
    const data = await requestJson('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        additional_text: additionalText.value,
        absent_text: absentText.value,
        excluded_term_ids: [...excludedTermIds],
        refractory: refractory.checked,
        patient_age: patientAge.value ? Number(patientAge.value) : null,
        patient_sex: patientSex.value,
      }),
    });

    latestAnalysis = data;
    latestInput = {text, additional: additionalText.value, absent: absentText.value, age: patientAge.value, sex: patientSex.value, refractory: refractory.checked};
    isStale = false;
    reviewConfirmed = destination === 2;
    refreshQuestionBuilder();
    renderTerms(data.terms);
    renderDiseases(data.diseases, data.hpoa_available);
    renderSignals(data);
    renderComparison(data);
    resultTools.hidden = !data.diseases.length;
    caseStatus.textContent = destination === 2
      ? `${data.terms.length} findings confirmed · ${data.diseases.length} candidates ready to inspect.`
      : `${data.terms.length} findings extracted. Check each term, add any confirmed absences, then continue.`;
    differential.hidden = !data.diseases.length;
    profileSelect.innerHTML = '<option value="">Choose a candidate to compare…</option>'
      + data.diseases.map((disease, index) => (
        `<option value="${index}">${escapeHtml(disease.name)}</option>`
      )).join('');
    exportButton.hidden = false;
    feedback.hidden = false;
    inputPanelState.textContent = `${data.terms.length} found`;
    resultsPanelState.textContent = `${data.diseases.length} ranked`;
    updateWizardAccess();
    setStep(destination, {scroll: true});
  } catch (error) {
    showError(termResults, error.message);
    showError(diseaseResults, 'Analysis failed. Check the service and try again.');
    inputPanelState.textContent = 'Review';
    resultsPanelState.textContent = 'Error';
    caseStatus.textContent = 'Analysis could not complete. Review the error below and try again.';
    updateWizardAccess();
    setStep(destination === 2 ? 1 : 0);
  } finally {
    setLoading(false);
  }
}

analyzeButton.addEventListener('click', () => analyze(1));
reviewContinue.addEventListener('click', () => analyze(2));
guidedDemoNext.addEventListener('click', () => {
  const currentStep = Number(document.querySelector('.workflow [aria-current="step"]')?.dataset.wizardGo || 0);
  if (currentStep === 1) {
    analyze(2);
    return;
  }
  document.querySelector('#view-compare').click();
  guidedDemoNext.hidden = true;
  guidedDemoTitle.textContent = 'Side-by-side evidence is open.';
  guidedDemoCopy.textContent = 'Each column shows which patient findings the leading profiles explain and where annotations are missing.';
  document.querySelector('#comparison').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start'});
});
document.querySelector('#guided-demo-close').addEventListener('click', () => {
  guidedDemoActive = false;
  guidedDemo.hidden = true;
});
textInput.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    analyze(1);
  }
});
textInput.addEventListener('input', () => excludedTermIds.clear());

termResults.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-term]');
  if (!button) return;
  excludedTermIds.add(button.dataset.removeTerm);
  analyze(1);
});

profileSelect.addEventListener('change', event => {
  renderProfile(latestAnalysis?.diseases[event.target.value]);
});
exportButton.addEventListener('click', () => {
  if (!latestAnalysis || !latestInput || isStale) return;
  const data = latestAnalysis;
  const lines = ['NOTICE — REVIEW BRIEF', new Date().toLocaleString(),
    'Heuristic phenotype comparison. Not a diagnosis. Scores are similarity values, not probabilities.',
    '', 'CASE NOTE', latestInput.text, '',
    `Explicitly absent: ${latestInput.absent || 'None'}`, `Age: ${latestInput.age || 'Unspecified'}; sex: ${latestInput.sex}; persistent despite treatment: ${latestInput.refractory ? 'Yes' : 'No'}`,
    '', 'PHENOTYPE SET', ...data.terms.map(t => `${t.name} (${t.id})`), '', 'CANDIDATE PROFILES'];
  data.diseases.forEach((d, i) => lines.push('', `${i + 1}. ${d.name} (${d.id})`,
    `Weighted similarity score: ${(d.score * 100).toFixed(1)}`, `Matched: ${d.matched_terms.map(t => t.name).join(', ')}`,
    `Unreported (partial list): ${d.missing_term_ids.map(t => t.name).join(', ') || 'None listed'}`,
    `Absent expected findings: ${d.absent_expected.map(t => t.name).join(', ') || 'None'}`,
    `Flags: ${d.flags.join(', ') || 'None'}`, `Resources: ${d.resources.GARD} | ${d.resources.NORD}`));
  document.querySelector('#brief-text').value = lines.join('\n');
  document.querySelector('#brief-status').textContent = '';
  document.querySelector('#brief-dialog').showModal();
});
document.querySelector('#brief-close').addEventListener('click', () => document.querySelector('#brief-dialog').close());
document.querySelector('#brief-copy').addEventListener('click', async () => {
  const brief = document.querySelector('#brief-text');
  try {
    await navigator.clipboard.writeText(brief.value);
    document.querySelector('#brief-status').textContent = 'Brief copied.';
  } catch {
    brief.focus();
    brief.select();
    document.querySelector('#brief-status').textContent = 'Text selected. Press Ctrl+C or Command+C to copy.';
  }
});
document.querySelector('#brief-save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([document.querySelector('#brief-text').value], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'clinical-analysis-review.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.querySelector('#brief-status').textContent = 'Download requested. If your browser does not save the file, use Copy brief.';
});

feedback.addEventListener('click', async event => {
  const button = event.target.closest('[data-useful]');
  if (!button) return;

  const buttons = feedback.querySelectorAll('button');
  buttons.forEach(item => { item.disabled = true; });
  try {
    await requestJson('/api/feedback', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        useful: button.dataset.useful === 'true',
        disease_id: latestAnalysis?.diseases[0]?.id || null,
      }),
    });
    feedback.innerHTML = '<div><strong>Thanks for the feedback.</strong><span>Saved locally.</span></div>';
  } catch (error) {
    feedback.querySelector('div span').textContent = error.message;
    buttons.forEach(item => { item.disabled = false; });
  }
});
