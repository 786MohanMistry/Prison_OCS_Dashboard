/* index.js - Standalone (Client-Side) Edition */

let appState = {
        raw: { facility: [], progress: [], hiv: [], tb: [] },
    staged: { facility: null, progress: null, hiv: null, tb: null },
    data: null,
    filters: {
        state: 'All',
        facilityType: 'All',
        prisonType: 'All',
        pu: 'All',
        groupBy: 'Month'
    },
    progressDateFilter: { startDate: '', endDate: '' },
    facilityTable: {
        currentPage: 1,
        pageSize: 15,
        sortBy: 'PrisonOCSCode',
        sortOrder: 'asc',
        pcFilter: 'All'
    },
    filesLoaded: { facility: false, progress: false, hiv: false, tb: false }
};

const GITHUB_BASE = 'https://raw.githubusercontent.com/786MohanMistry/Prison_OCS_Dashboard/main/';
const LOCAL_BASE = '';
const JSON_FILES = {
    facility: LOCAL_BASE + 'facility.json',
    progress: LOCAL_BASE + 'progress.json',
    hiv: LOCAL_BASE + 'hiv.json',
    tb: LOCAL_BASE + 'tb.json'
};
const GITHUB_JSON_FILES = {
    facility: GITHUB_BASE + 'facility.json',
    progress: GITHUB_BASE + 'progress.json',
    hiv: GITHUB_BASE + 'hiv.json',
    tb: GITHUB_BASE + 'tb.json'
};
const XLSX_FILES = {
    facility: { name: 'Facility_Data.xlsx', url: GITHUB_BASE + 'Facility_Data.xlsx' },
    progress: { name: '1_P&OCS Progress.xlsx', url: GITHUB_BASE + '1_P%26OCS%20Progress.xlsx' },
    hiv: { name: '2_HIV_Positive.xlsx', url: GITHUB_BASE + '2_HIV_Positive.xlsx' },
    tb: { name: '3_TB Positive.xlsx', url: GITHUB_BASE + '3_TB%20Positive.xlsx' }
};

async function loadFromJSON(jsonFiles, sourceLabel) {
    showSpinner('Loading data...');
    const results = await Promise.all(Object.keys(jsonFiles).map(async (type) => {
        const resp = await fetch(jsonFiles[type]);
        if (!resp.ok) throw new Error(type + '.json: HTTP ' + resp.status);
        return { type, data: await resp.json() };
    }));
    results.forEach(({ type, data }) => {
        appState.raw[type] = data;
        appState.filesLoaded[type] = true;
        updateFileBadge(type, data.length);
    });
    restoreDatesInPlace(appState.raw.progress, DATE_FIELDS_PROGRESS);
    restoreDatesInPlace(appState.raw.hiv, DATE_FIELDS_HIV);
    restoreDatesInPlace(appState.raw.tb, DATE_FIELDS_TB);
    appState.raw.progress.forEach(p => {
        p.PU = calculatePU(p.ReportingMonth || p.EndDate);
        if (p.CampsOrganized === undefined) p.CampsOrganized = 0;
        if (p.STIScreened === undefined) p.STIScreened = 0;
        if (p.SyphilisTested === undefined) p.SyphilisTested = 0;
        if (p.HBVTested === undefined) p.HBVTested = 0;
        if (p.HCVTested === undefined) p.HCVTested = 0;
    });
    renderDashboard();
    navigateToSection('overviewSection');
    hideSpinner();
    document.getElementById('lastLoadedLabel').innerText = sourceLabel;
}

async function loadAllFromXLSX() {
    showSpinner('Downloading Excel files...');
    const results = await Promise.all(Object.keys(XLSX_FILES).map(async (type) => {
        const info = XLSX_FILES[type];
        const resp = await fetch(info.url);
        if (!resp.ok) throw new Error(info.name + ': HTTP ' + resp.status);
        const buf = await resp.arrayBuffer();
        const data = new Uint8Array(buf);
        let parsed = [];
        if (type === 'facility') parsed = parseFacilityFile(data);
        else if (type === 'progress') parsed = parseProgressFile(data);
        else if (type === 'hiv') parsed = parseHIVFile(data);
        else if (type === 'tb') parsed = parseTBFile(data);
        updateFileBadge(type, parsed.length);
        return { type, parsed };
    }));
    results.forEach(({ type, parsed }) => {
        appState.raw[type] = parsed;
        appState.filesLoaded[type] = true;
    });
    renderDashboard();
    navigateToSection('overviewSection');
    hideSpinner();
    document.getElementById('lastLoadedLabel').innerText = 'Loaded from GitHub repository';
}

async function loadAllFromGitHub() {
    try {
        await loadFromJSON(GITHUB_JSON_FILES, 'Loaded from GitHub repository');
    } catch (err) {
        console.warn('GitHub JSON not found, trying XLSX...', err.message);
        try {
            await loadAllFromXLSX();
        } catch (err2) {
            console.warn('GitHub XLSX also failed:', err2.message);
            hideSpinner();
        }
    }
}

Chart.register(ChartDataLabels);

let charts = { prisonPie: null, ocsPie: null, hivTrend: null, tbTrend: null, stiTrend: null, syphilisTrend: null, hbvTrend: null, hcvTrend: null };

const dlConfig = {
    color: '#e2e8f0',
    font: { family: 'Outfit', weight: 'bold' },
    anchor: 'end',
    align: 'end',
    offset: 2
};

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

function showSpinner(text) {
    loadingText.innerText = text || "Loading...";
    loadingOverlay.style.display = 'flex';
}
function hideSpinner() {
    loadingOverlay.style.display = 'none';
}

function formatNum(val, isPct, precision) {
    if (precision === undefined) precision = 0;
    if (val === null || val === undefined || isNaN(val)) return '-';
    if (isPct) {
        if (val === 0) return '0%';
        return val.toFixed(precision) + '%';
    }
    if (val === 0) return '-';
    return typeof val === 'number' ? Math.round(val).toLocaleString() : val;
}

function navigateToSection(targetId) {
    const menuItem = document.querySelector(`.sidebar-menu-item[data-target="${targetId}"]`);
    if (!menuItem) return;
    document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
    menuItem.classList.add('active');
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.add('active');
    const sectionTitle = menuItem.innerText.trim();
    document.getElementById('sectionTitle').innerText = sectionTitle;
    const subtitleEl = document.getElementById('sectionSubtitle');
    const subs = {
        overviewSection: "Weekly & Monthly Performance Indicators",
        reportedSection: "Prison Reporting Frequencies & Diagnostic Summary",
        progressSection: "Facility-Wise Detailed Diagnostics and ATT Linkages",
        uploadSection: "Import Excel Progress sheets and Facilities data"
    };
    subtitleEl.innerText = subs[targetId] || '';
}

document.querySelectorAll('.sidebar-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToSection(item.getAttribute('data-target'));
    });
});

// --- LocalStorage Persistence (synchronous, reliable) ---

const STORAGE_KEY = 'subhiksha_dashboard_v2';

function saveRawToStorage() {
    try {
        const payload = {
            data: appState.raw,
            filesLoaded: appState.filesLoaded,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch (e) {
        return false;
    }
}

function loadRawFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !payload.data) return null;
        return payload;
    } catch (e) {
        console.warn('localStorage load failed:', e);
        return null;
    }
}

function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

// Date fields that need to be converted back from strings after JSON.parse
const DATE_FIELDS_PROGRESS = ['StartDate', 'EndDate', 'ReportingMonth'];
const DATE_FIELDS_HIV = ['SubmissionDate', 'HIVConfDate', 'ARTInitDate'];
const DATE_FIELDS_TB = ['SubmissionDate', 'TBTestDate', 'ATTInitDate'];

function restoreDatesInPlace(arr, fields) {
    if (!arr) return;
    for (const item of arr) {
        for (const f of fields) {
            if (item[f] && typeof item[f] === 'string') {
                item[f] = new Date(item[f]);
            }
        }
    }
}

// --- Excel Parsing (SheetJS) ---

function xlToDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000));
    if (typeof val === 'string') {
        const d = new Date(val);
        if (!isNaN(d)) return d;
        const parts = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (parts) return new Date(+parts[3], +parts[1] - 1, +parts[2]);
    }
    return null;
}

function toNum(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        if (val.toLowerCase() === 'yes') return 1;
        if (val.toLowerCase() === 'no') return 0;
        const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? 0 : n;
    }
    return 0;
}

function sheetToArray(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    return rows;
}

function getCol(obj, names) {
    if (typeof names === 'string') names = [names];
    for (const name of names) {
        if (obj[name] !== undefined) return obj[name];
    }
    const lower = names.map(n => n.toLowerCase());
    const keys = Object.keys(obj);
    for (const k of keys) {
        const kl = k.toLowerCase();
        const idx = lower.indexOf(kl);
        if (idx !== -1) return obj[names[idx]];
    }
    for (const k of keys) {
        const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let i = 0; i < names.length; i++) {
            if (lower[i].replace(/[^a-z0-9]/g, '') === kl) return obj[names[i]];
        }
    }
    console.warn('None of [' + names.join('], [') + '] found in row');
    return undefined;
}

function parseFacilityFile(data) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets['Facility Data'] || wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToArray(ws);
    return rows.map(r => ({
        FacilityAppID: ('' + (r['Facility AppID'] || '')).trim(),
        Name: ('' + (r['Name of Prison/OCS'] || '')).trim(),
        Type: ('' + (r['Type of Prison/OCS'] || '')).trim(),
        FacilityType: ('' + (r['Type of Facility'] || '')).trim(),
        State: ('' + (r['Address--State'] || '')).trim(),
        Target: toNum(r['Monthly Target']),
        PrisonOCSCode: ('' + (r['Prison/OCS ID'] || '')).trim(),
        CreatedByUser: ('' + (r['Created By User'] || '')).trim()
    })).filter(f => f.PrisonOCSCode !== '');
}

function calculatePU(date) {
    if (!date) return 'Unknown';
    const m = date.getMonth();
    const y = date.getFullYear();
    let startYear;
    if (m >= 3 && m <= 8) {
        startYear = y;
        return 'PU' + ((startYear - 2024) * 2 + 1);
    }
    if (m >= 9) startYear = y;
    else startYear = y - 1;
    return 'PU' + ((startYear - 2024) * 2 + 2);
}

function countUniqueMonths(progressData) {
    const months = new Set();
    progressData.forEach(p => {
        const d = p.ReportingMonth || p.EndDate;
        if (d) {
            months.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
        }
    });
    return months.size || 1;
}

function parseProgressFile(data) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets['Prison-OCS Progress'] || wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToArray(ws);
    if (rows.length > 0) {
        console.log('Progress column headers:', Object.keys(rows[0]).join(', '));
    }
    return rows.map(r => {
        const code = ('' + getCol(r, ['Prison/OCS - ID']) || '').trim();
        if (!code) return null;
        const c4S = toNum(getCol(r, ['Number of inmates screened for TB through 4S+--.Total']));
        const cDD = toNum(getCol(r, ['Number of inmates screened for TB through Handheld X-ray-- .Total', 'Number of inmates screened for TB through Handheld X-ray--.Total']));
        const cDH = toNum(getCol(r, ['Number of inmates found TB Symptomatic during the reporting month--.Total']));
        const cDL = toNum(getCol(r, ['Number of symptomatic inmates tested for TB testing during the reporting month--.Total']));
        const testedCamp = toNum(getCol(r, ['Number of inmates screened for HIV through camps--.Total']));
        const testedFICTC = toNum(getCol(r, ['Number of inmates screened/tested through prison based F-ICTCs--.Total']));
        const testedSAICTC = toNum(getCol(r, ['Number of inmates tested for HIV through prison based SA-ICTCs--.Total']));
        const campsProject = toNum(getCol(r, ['No. of camp organized by the project', 'No. of camps organized by the project', 'No. of camp organised by the project']));
        const campsPrison = toNum(getCol(r, ['No. of camp organised by the prison', 'No. of camp organized by the prison', 'No. of camps organized by the prison', 'No. of camps organised by the prison']));
        const stiScreened = toNum(getCol(r, ['Number of inmates diagnosed with STI (SCM) during the reporting month--.Total']));
        const syphilisTested = toNum(getCol(r, ['Number of inmates tested for Syphilis during the reporting month--.Total']));
        const hbvTested = toNum(getCol(r, ['Number of inmates tested for HBV during the reporting month--.Total']));
        const hcvTested = toNum(getCol(r, ['Number of inmates tested for HCV during the reporting month--.Total']));
        return {
            PrisonOCSCode: code,
            StartDate: xlToDate(r['Start Date']),
            EndDate: xlToDate(r['End Date']),
            ReportingMonth: xlToDate(r['Reporting Month(MM/YY)']),
            ReportedStatus: ('' + getCol(r, ['Counselling/Testing/Linkage Happened']) || '').trim(),
            TestedHIV: testedCamp + testedFICTC + testedSAICTC,
            ScreenedTB: c4S,
            TBPresumptive: cDH,
            TestedTB: cDL,
            HHXRScreened: cDD,
            HHXRPresumptive: cDH,
            HHXRTested: cDL,
            CampsOrganized: campsProject + campsPrison,
            STIScreened: stiScreened,
            SyphilisTested: syphilisTested,
            HBVTested: hbvTested,
            HCVTested: hcvTested,
            PU: calculatePU(xlToDate(r['Reporting Month(MM/YY)']) || xlToDate(r['End Date']))
        };
    }).filter(r => r !== null);
}

function parseHIVFile(data) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets['HIV Testing Record'] || wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToArray(ws);
    if (rows.length > 0) {
        console.log('HIV column headers:', Object.keys(rows[0]).join(', '));
    }
    return rows.map(r => {
        const code = ('' + getCol(r, ['Prison/OCS - ID']) || '').trim();
        if (!code) return null;
        return {
            PrisonOCSCode: code,
            SubmissionDate: xlToDate(getCol(r, ['Submission Date'])),
            HIVPositive: toNum(getCol(r, ['HIV Positive', 'HIV Positive (on date of test)'])),
            OnART: toNum(getCol(r, ['Initiated on ART1', 'Initiated on ART'])),
            HIVConfDate: xlToDate(getCol(r, ['Date of HIV confirmation test'])),
            ARTInitDate: xlToDate(getCol(r, ['Date of ART initiation']))
        };
    }).filter(r => r !== null);
}

function parseTBFile(data) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets['TB'] || wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToArray(ws);
    if (rows.length > 0) {
        console.log('TB column headers:', Object.keys(rows[0]).join(', '));
    }
    return rows.map(r => {
        const code = ('' + getCol(r, ['Prison/OCS - ID']) || '').trim();
        if (!code) return null;
        return {
            PrisonOCSCode: code,
            SubmissionDate: xlToDate(getCol(r, ['Submission Date'])),
            Mode: ('' + getCol(r, ['Mode of TB screening']) || '').trim(),
            DiagnosedTB: toNum(getCol(r, ['Diagnosed with TB', 'Diagnosed with TB1'])),
            OnATT: toNum(getCol(r, ['On ATT'])),
            TBTestDate: xlToDate(getCol(r, ['Date of tested for TB'])),
            ATTInitDate: xlToDate(getCol(r, ['Date of ART initiation']))
        };
    }).filter(r => r !== null);
}

function updateFileBadge(type, rows) {
    const badgeMap = { facility: 'badge-facility', progress: 'badge-progress', hiv: 'badge-hiv', tb: 'badge-tb' };
    const rowsMap = { facility: 'label-facility-rows', progress: 'label-progress-rows', hiv: 'label-hiv-rows', tb: 'label-tb-rows' };
    const badge = document.getElementById(badgeMap[type]);
    const rowsLabel = document.getElementById(rowsMap[type]);
    if (badge) {
        badge.innerText = 'Loaded (' + rows + ' rows)';
        badge.className = 'badge badge-success';
    }
    if (rowsLabel) rowsLabel.innerText = 'Rows: ' + rows.toLocaleString();
}

document.querySelectorAll('.excel-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const type = input.getAttribute('data-type');
        showSpinner('Reading ' + file.name + '...');
        try {
            const buf = await file.arrayBuffer();
            const data = new Uint8Array(buf);
            let parsed = [];
            if (type === 'facility') parsed = parseFacilityFile(data);
            else if (type === 'progress') parsed = parseProgressFile(data);
            else if (type === 'hiv') parsed = parseHIVFile(data);
            else if (type === 'tb') parsed = parseTBFile(data);
            appState.staged[type] = parsed;
            appState.filesLoaded[type] = true;
            updateFileBadge(type, parsed.length);
        } catch (err) {
            alert('Error reading file: ' + err.message);
            console.error(err);
        } finally {
            hideSpinner();
            input.value = '';
        }
    });
});

// --- Data Aggregation (ported from server.ps1) ---

function processDashboardData() {
    const f = appState.filters;
    const raw = appState.raw;

    const facilities = raw.facility.filter(fac => {
        if (f.state !== 'All' && fac.State !== f.state) return false;
        if (f.facilityType !== 'All' && fac.FacilityType !== f.facilityType) return false;
        if (f.prisonType !== 'All' && fac.Type !== f.prisonType) return false;
        return true;
    });

    const facCodes = new Set(facilities.map(f => f.PrisonOCSCode));
    const facTargets = {};
    const facDetails = {};
    facilities.forEach(f => {
        facTargets[f.PrisonOCSCode] = f.Target;
        facDetails[f.PrisonOCSCode] = f;
    });

    const filteredProgress = raw.progress.filter(p => {
        if (!facCodes.has(p.PrisonOCSCode)) return false;
        if (f.pu !== 'All' && p.PU !== f.pu) return false;
        return true;
    });

    // Only keep progress records where ReportedStatus is Yes or No
    const reportedProgress = filteredProgress.filter(p => {
        const s = (p.ReportedStatus || '').toLowerCase();
        return s === 'yes' || s === 'no';
    });

    let filterStart = null, filterEnd = null;
    if (f.pu !== 'All') {
        filteredProgress.forEach(p => {
            const d = p.ReportingMonth || p.EndDate;
            if (d) {
                if (!filterStart || d < filterStart) filterStart = d;
                if (!filterEnd || d > filterEnd) filterEnd = d;
            }
        });
        if (filterStart) filterStart = new Date(filterStart.getFullYear(), filterStart.getMonth(), 1);
        if (filterEnd) filterEnd = new Date(filterEnd.getFullYear(), filterEnd.getMonth() + 1, 0);
    }
    const MIN_START = new Date(2024, 3, 1);
    if (!filterStart || filterStart < MIN_START) filterStart = MIN_START;

    const monthCount = countUniqueMonths(filteredProgress);
    const overallMonthCount = countUniqueMonths(raw.progress);
    const totalRawTarget = facilities.reduce((sum, f) => sum + f.Target, 0);

    const reportsCountByCode = {};
    const reportedHIVByCode = {};
    const reportedTBScreenedByCode = {};
    const reportedTBPresByCode = {};
    const reportedTBTestedByCode = {};
    const reportedHHXRScreenedByCode = {};
    const reportedHHXRPresByCode = {};
    const reportedHHXRTestedByCode = {};
    const reportedCampsByCode = {};
    const reportedSTIByCode = {};
    const reportedSyphilisByCode = {};
    const reportedHBVByCode = {};
    const reportedHCVByCode = {};

    reportedProgress.forEach(p => {
        const code = p.PrisonOCSCode;
        reportsCountByCode[code] = (reportsCountByCode[code] || 0) + 1;
        reportedHIVByCode[code] = (reportedHIVByCode[code] || 0) + p.TestedHIV;
        reportedTBScreenedByCode[code] = (reportedTBScreenedByCode[code] || 0) + p.ScreenedTB;
        reportedTBPresByCode[code] = (reportedTBPresByCode[code] || 0) + p.TBPresumptive;
        reportedTBTestedByCode[code] = (reportedTBTestedByCode[code] || 0) + p.TestedTB;
        reportedHHXRScreenedByCode[code] = (reportedHHXRScreenedByCode[code] || 0) + p.HHXRScreened;
        if ((p.HHXRScreened || 0) > 0) {
            reportedHHXRPresByCode[code] = (reportedHHXRPresByCode[code] || 0) + (p.TBPresumptive || 0);
            reportedHHXRTestedByCode[code] = (reportedHHXRTestedByCode[code] || 0) + (p.TestedTB || 0);
        }
        reportedCampsByCode[code] = (reportedCampsByCode[code] || 0) + (p.CampsOrganized || 0);
        reportedSTIByCode[code] = (reportedSTIByCode[code] || 0) + (p.STIScreened || 0);
        reportedSyphilisByCode[code] = (reportedSyphilisByCode[code] || 0) + (p.SyphilisTested || 0);
        reportedHBVByCode[code] = (reportedHBVByCode[code] || 0) + (p.HBVTested || 0);
        reportedHCVByCode[code] = (reportedHCVByCode[code] || 0) + (p.HCVTested || 0);
    });

    const reportedHIVPosByCode = {};
    raw.hiv.forEach(h => {
        if (!facCodes.has(h.PrisonOCSCode)) return;
        if (filterStart && h.HIVConfDate && h.HIVConfDate < filterStart) return;
        if (filterEnd && h.HIVConfDate && h.HIVConfDate > filterEnd) return;
        reportedHIVPosByCode[h.PrisonOCSCode] = (reportedHIVPosByCode[h.PrisonOCSCode] || 0) + h.HIVPositive;
    });

    const reportedOnARTByCode = {};
    raw.hiv.forEach(h => {
        if (!facCodes.has(h.PrisonOCSCode)) return;
        if (filterStart && h.HIVConfDate && h.HIVConfDate < filterStart) return;
        if (filterEnd && h.HIVConfDate && h.HIVConfDate > filterEnd) return;
        reportedOnARTByCode[h.PrisonOCSCode] = (reportedOnARTByCode[h.PrisonOCSCode] || 0) + h.OnART;
    });

    const reportedTBDiagByCode = {};
    const reportedOnATTByCode = {};
    raw.tb.forEach(t => {
        if (!facCodes.has(t.PrisonOCSCode)) return;
        if (filterStart && t.TBTestDate && t.TBTestDate < filterStart) return;
        if (filterEnd && t.TBTestDate && t.TBTestDate > filterEnd) return;
        reportedTBDiagByCode[t.PrisonOCSCode] = (reportedTBDiagByCode[t.PrisonOCSCode] || 0) + t.DiagnosedTB;
        if (filterStart && t.ATTInitDate && t.ATTInitDate < filterStart) return;
        if (filterEnd && t.ATTInitDate && t.ATTInitDate > filterEnd) return;
        reportedOnATTByCode[t.PrisonOCSCode] = (reportedOnATTByCode[t.PrisonOCSCode] || 0) + t.OnATT;
    });

    const reportedHHXRDiagByCode = {};
    const reportedHHXRAttByCode = {};
    raw.tb.forEach(t => {
        if (!facCodes.has(t.PrisonOCSCode)) return;
        if (t.Mode !== 'Handheld X-Ray') return;
        if (filterStart && t.TBTestDate && t.TBTestDate < filterStart) return;
        if (filterEnd && t.TBTestDate && t.TBTestDate > filterEnd) return;
        reportedHHXRDiagByCode[t.PrisonOCSCode] = (reportedHHXRDiagByCode[t.PrisonOCSCode] || 0) + t.DiagnosedTB;
        if (filterStart && t.ATTInitDate && t.ATTInitDate < filterStart) return;
        if (filterEnd && t.ATTInitDate && t.ATTInitDate > filterEnd) return;
        reportedHHXRAttByCode[t.PrisonOCSCode] = (reportedHHXRAttByCode[t.PrisonOCSCode] || 0) + t.OnATT;
    });

    // --- Module 1: Overview ---

    const prisonPie = {};
    const ocsPie = {};
    facilities.forEach(f => {
        if (f.FacilityType === 'Prison') prisonPie[f.Type] = (prisonPie[f.Type] || 0) + 1;
        else if (f.FacilityType === 'OCS') ocsPie[f.Type] = (ocsPie[f.Type] || 0) + 1;
    });

    const trendHIV = {};
    const trendTB = {};
    const trendSTI = {};
    const trendSyphilis = {};
    const trendHBV = {};
    const trendHCV = {};
    filteredProgress.forEach(p => {
        let key = 'Unknown';
        if (f.groupBy === 'PU') {
            key = p.PU || 'Unknown';
        } else if (f.groupBy === 'Month' && p.ReportingMonth) {
            key = p.ReportingMonth.getFullYear() + '-' + String(p.ReportingMonth.getMonth() + 1).padStart(2, '0');
        } else if (f.groupBy === 'Quarter' && p.ReportingMonth) {
            const q = Math.ceil((p.ReportingMonth.getMonth() + 1) / 3);
            key = p.ReportingMonth.getFullYear() + '-Q' + q;
        }
        trendHIV[key] = (trendHIV[key] || 0) + p.TestedHIV;
        trendTB[key] = (trendTB[key] || 0) + p.ScreenedTB;
        trendSTI[key] = (trendSTI[key] || 0) + (p.STIScreened || 0);
        trendSyphilis[key] = (trendSyphilis[key] || 0) + (p.SyphilisTested || 0);
        trendHBV[key] = (trendHBV[key] || 0) + (p.HBVTested || 0);
        trendHCV[key] = (trendHCV[key] || 0) + (p.HCVTested || 0);
    });

    const sortedKeys = Object.keys(trendHIV).sort();
    const trendsData = {
        labels: sortedKeys,
        HIVValues: sortedKeys.map(k => trendHIV[k]),
        TBValues: sortedKeys.map(k => trendTB[k]),
        STIValues: sortedKeys.map(k => trendSTI[k]),
        SyphilisValues: sortedKeys.map(k => trendSyphilis[k]),
        HBVValues: sortedKeys.map(k => trendHBV[k]),
        HCVValues: sortedKeys.map(k => trendHCV[k])
    };

    const prisonTypes = ["Central Jail", "District Jail", "Sub Jail", "Special Jail", "Open Jail", "Women Jail", "Borstal Jail", "Other Jail", "Juvenile Home", "Observation Home", "Special Home", "Place of Safety", "Others"];

    const module2Rows = [];
    prisonTypes.forEach(type => {
        const facsOfType = facilities.filter(f => f.Type === type);
        if (facsOfType.length === 0 && !type.includes('Jail')) return;

        let noOfPrison = facsOfType.length;
        let monthlyTarget = 0;
        let totalTestedHIV = 0, totalScreenedTB = 0, tbPresumptive = 0, tbTested = 0;
        let reported1 = 0, reported2 = 0, reported3 = 0, reported4 = 0, reported5 = 0, reported0Data = 0;
        const reportedCodes = {};

        facsOfType.forEach(f => {
            monthlyTarget += f.Target;
            const code = f.PrisonOCSCode;
            if (reportsCountByCode[code]) {
                reportedCodes[code] = true;
                const count = reportsCountByCode[code];
                if (count === 1) reported1++;
                else if (count === 2) reported2++;
                else if (count === 3) reported3++;
                else if (count === 4) reported4++;
                else if (count >= 5) reported5++;
                const hivTested = reportedHIVByCode[code] || 0;
                totalTestedHIV += hivTested;
                if (hivTested === 0) reported0Data++;
                totalScreenedTB += reportedTBScreenedByCode[code] || 0;
                tbPresumptive += reportedTBPresByCode[code] || 0;
                tbTested += reportedTBTestedByCode[code] || 0;
            }
        });

        const noOfPrisonReported = Object.keys(reportedCodes).length;
        const noOfPrisonNotReported = noOfPrison - noOfPrisonReported;

        let hivPositive = 0, onArt = 0;
        Object.keys(reportedCodes).forEach(code => {
            hivPositive += reportedHIVPosByCode[code] || 0;
            onArt += reportedOnARTByCode[code] || 0;
        });

        let diagTB = 0, onAtt = 0;
        Object.keys(reportedCodes).forEach(code => {
            diagTB += reportedTBDiagByCode[code] || 0;
            onAtt += reportedOnATTByCode[code] || 0;
        });

        const adjustedTarget = monthlyTarget * monthCount;
        module2Rows.push({
            Type: type,
            NoOfPrison: noOfPrison,
            NoOfPrisonReported: noOfPrisonReported,
            NoOfPrisonNotReported: noOfPrisonNotReported,
            NoOfPrisonReported0: reported0Data,
            Reported1: reported1, Reported2: reported2, Reported3: reported3,
            Reported4: reported4, Reported5: reported5,
            MonthlyTarget: adjustedTarget,
            TestedHIV: totalTestedHIV,
            PctAchieved: adjustedTarget > 0 ? (totalTestedHIV / adjustedTarget) * 100 : 0,
            HIVPositive: hivPositive,
            OnART: onArt,
            PctOnART: hivPositive > 0 ? (onArt / hivPositive) * 100 : 0,
            ScreenedTB: totalScreenedTB,
            PctTBScreened: adjustedTarget > 0 ? (totalScreenedTB / adjustedTarget) * 100 : 0,
            TBPresumptive: tbPresumptive,
            PctPresumptive: totalScreenedTB > 0 ? (tbPresumptive / totalScreenedTB) * 100 : 0,
            TestedTB: tbTested,
            PctTested: tbPresumptive > 0 ? (tbTested / tbPresumptive) * 100 : 0,
            DiagnosedTB: diagTB,
            PctTBPositivity: tbTested > 0 ? (diagTB / tbTested) * 100 : 0,
            OnATT: onAtt,
            PctOnATT: diagTB > 0 ? (onAtt / diagTB) * 100 : 0
        });
    });

    const module3Rows = [];
    facilities.forEach(f => {
        const code = f.PrisonOCSCode;
        const weeks = reportsCountByCode[code] || 0;
        const campsOrg = reportedCampsByCode[code] || 0;
        const hivTested = reportedHIVByCode[code] || 0;
        const hivPos = reportedHIVPosByCode[code] || 0;
        const onArt = reportedOnARTByCode[code] || 0;
        const tbScreened = reportedTBScreenedByCode[code] || 0;
        const tbPres = reportedTBPresByCode[code] || 0;
        const tbTested = reportedTBTestedByCode[code] || 0;
        const tbDiag = reportedTBDiagByCode[code] || 0;
        const tbAtt = reportedOnATTByCode[code] || 0;
        const hhxrScreened = reportedHHXRScreenedByCode[code] || 0;
        const hhxrPres = reportedHHXRPresByCode[code] || 0;
        const hhxrTested = reportedHHXRTestedByCode[code] || 0;
        const hhxrDiag = reportedHHXRDiagByCode[code] || 0;
        const hhxrAtt = reportedHHXRAttByCode[code] || 0;

        const facAdjustedTarget = f.Target * monthCount;
        module3Rows.push({
            PrisonOCSCode: code,
            Name: f.Name,
            Type: f.Type,
            WeeksReported: weeks,
            CampsOrganized: campsOrg,
            Target: facAdjustedTarget,
            TestedHIV: hivTested,
            PctAchieved: facAdjustedTarget > 0 ? (hivTested / facAdjustedTarget) * 100 : 0,
            HIVPositive: hivPos,
            OnART: onArt,
            PctOnART: hivPos > 0 ? (onArt / hivPos) * 100 : 0,
            ScreenedTB: tbScreened,
            TBPresumptive: tbPres,
            PctPresumptive: tbScreened > 0 ? (tbPres / tbScreened) * 100 : 0,
            TestedTB: tbTested,
            PctTested: tbPres > 0 ? (tbTested / tbPres) * 100 : 0,
            DiagnosedTB: tbDiag,
            PctTBPositivity: tbTested > 0 ? (tbDiag / tbTested) * 100 : 0,
            OnATT: tbAtt,
            PctOnATT: tbDiag > 0 ? (tbAtt / tbDiag) * 100 : 0,
            HHXRScreened: hhxrScreened,
            HHXRPresumptive: hhxrPres,
            PctHHXRPresumptive: hhxrScreened > 0 ? (hhxrPres / hhxrScreened) * 100 : 0,
            HHXRTested: hhxrTested,
            PctHHXRTested: hhxrPres > 0 ? (hhxrTested / hhxrPres) * 100 : 0,
            HHXRDiagnosed: hhxrDiag,
            PctHHXRPositive: hhxrTested > 0 ? (hhxrDiag / hhxrTested) * 100 : 0,
            HHXROnATT: hhxrAtt,
            PctHHXROnATT: hhxrDiag > 0 ? (hhxrAtt / hhxrDiag) * 100 : 0
        });
    });

    appState.data = {
        Overview: {
            PrisonPie: { labels: Object.keys(prisonPie), values: Object.values(prisonPie) },
            OCSPie: { labels: Object.keys(ocsPie), values: Object.values(ocsPie) },
            Trends: trendsData,
            overallMonthCount: overallMonthCount,
            totalRawTarget: totalRawTarget
        },
        Module2: module2Rows,
        Module3: module3Rows
    };

    const allFac = facilities;
    const allPU = [...new Set(filteredProgress.map(p => p.PU).filter(Boolean))].filter(pu => {
        const n = parseInt(pu.replace('PU', ''), 10);
        return !isNaN(n) && n >= 1;
    }).sort();
    const allTypes = [...new Set(facilities.map(f => f.Type).filter(Boolean))].sort();

    return { states: [...new Set(allFac.map(f => f.State).filter(Boolean))].sort(), pus: allPU, types: allTypes };
}

function buildFacilityRowsForDateRange(startDate, endDate) {
    const f = appState.filters;
    const raw = appState.raw;

    const facilities = raw.facility.filter(fac => {
        if (f.state !== 'All' && fac.State !== f.state) return false;
        if (f.facilityType !== 'All' && fac.FacilityType !== f.facilityType) return false;
        if (f.prisonType !== 'All' && fac.Type !== f.prisonType) return false;
        return true;
    });

    const facCodes = new Set(facilities.map(f => f.PrisonOCSCode));

    const filteredProgress = raw.progress.filter(p => {
        if (!facCodes.has(p.PrisonOCSCode)) return false;
        if (f.pu !== 'All' && p.PU !== f.pu) return false;
        if (startDate && p.EndDate && p.EndDate < startDate) return false;
        if (endDate && p.EndDate && p.EndDate > endDate) return false;
        return true;
    });

    // Only keep progress records where ReportedStatus is Yes or No
    const reportedProgress = filteredProgress.filter(p => {
        const s = (p.ReportedStatus || '').toLowerCase();
        return s === 'yes' || s === 'no';
    });

    const reportsCountByCode = {};
    const reportedHIVByCode = {};
    const reportedTBScreenedByCode = {};
    const reportedTBPresByCode = {};
    const reportedTBTestedByCode = {};
    const reportedHHXRScreenedByCode = {};
    const reportedHHXRPresByCode = {};
    const reportedHHXRTestedByCode = {};
    const reportedCampsByCode = {};
    const reportedSTIByCode = {};
    const reportedSyphilisByCode = {};
    const reportedHBVByCode = {};
    const reportedHCVByCode = {};

    reportedProgress.forEach(p => {
        const code = p.PrisonOCSCode;
        reportsCountByCode[code] = (reportsCountByCode[code] || 0) + 1;
        reportedHIVByCode[code] = (reportedHIVByCode[code] || 0) + p.TestedHIV;
        reportedTBScreenedByCode[code] = (reportedTBScreenedByCode[code] || 0) + p.ScreenedTB;
        reportedTBPresByCode[code] = (reportedTBPresByCode[code] || 0) + p.TBPresumptive;
        reportedTBTestedByCode[code] = (reportedTBTestedByCode[code] || 0) + p.TestedTB;
        reportedHHXRScreenedByCode[code] = (reportedHHXRScreenedByCode[code] || 0) + p.HHXRScreened;
        if ((p.HHXRScreened || 0) > 0) {
            reportedHHXRPresByCode[code] = (reportedHHXRPresByCode[code] || 0) + (p.TBPresumptive || 0);
            reportedHHXRTestedByCode[code] = (reportedHHXRTestedByCode[code] || 0) + (p.TestedTB || 0);
        }
        reportedCampsByCode[code] = (reportedCampsByCode[code] || 0) + (p.CampsOrganized || 0);
        reportedSTIByCode[code] = (reportedSTIByCode[code] || 0) + (p.STIScreened || 0);
        reportedSyphilisByCode[code] = (reportedSyphilisByCode[code] || 0) + (p.SyphilisTested || 0);
        reportedHBVByCode[code] = (reportedHBVByCode[code] || 0) + (p.HBVTested || 0);
        reportedHCVByCode[code] = (reportedHCVByCode[code] || 0) + (p.HCVTested || 0);
    });

    const reportedHIVPosByCode = {};
    raw.hiv.forEach(h => {
        if (!facCodes.has(h.PrisonOCSCode)) return;
        if (startDate && h.HIVConfDate && h.HIVConfDate < startDate) return;
        if (endDate && h.HIVConfDate && h.HIVConfDate > endDate) return;
        reportedHIVPosByCode[h.PrisonOCSCode] = (reportedHIVPosByCode[h.PrisonOCSCode] || 0) + h.HIVPositive;
    });

    const reportedOnARTByCode = {};
    raw.hiv.forEach(h => {
        if (!facCodes.has(h.PrisonOCSCode)) return;
        if (startDate && h.HIVConfDate && h.HIVConfDate < startDate) return;
        if (endDate && h.HIVConfDate && h.HIVConfDate > endDate) return;
        reportedOnARTByCode[h.PrisonOCSCode] = (reportedOnARTByCode[h.PrisonOCSCode] || 0) + h.OnART;
    });

    const reportedTBDiagByCode = {};
    const reportedOnATTByCode = {};
    raw.tb.forEach(t => {
        if (!facCodes.has(t.PrisonOCSCode)) return;
        if (startDate && t.TBTestDate && t.TBTestDate < startDate) return;
        if (endDate && t.TBTestDate && t.TBTestDate > endDate) return;
        reportedTBDiagByCode[t.PrisonOCSCode] = (reportedTBDiagByCode[t.PrisonOCSCode] || 0) + t.DiagnosedTB;
        if (startDate && t.ATTInitDate && t.ATTInitDate < startDate) return;
        if (endDate && t.ATTInitDate && t.ATTInitDate > endDate) return;
        reportedOnATTByCode[t.PrisonOCSCode] = (reportedOnATTByCode[t.PrisonOCSCode] || 0) + t.OnATT;
    });

    const reportedHHXRDiagByCode = {};
    const reportedHHXRAttByCode = {};
    raw.tb.forEach(t => {
        if (!facCodes.has(t.PrisonOCSCode)) return;
        if (t.Mode !== 'Handheld X-Ray') return;
        if (startDate && t.TBTestDate && t.TBTestDate < startDate) return;
        if (endDate && t.TBTestDate && t.TBTestDate > endDate) return;
        reportedHHXRDiagByCode[t.PrisonOCSCode] = (reportedHHXRDiagByCode[t.PrisonOCSCode] || 0) + t.DiagnosedTB;
        if (startDate && t.ATTInitDate && t.ATTInitDate < startDate) return;
        if (endDate && t.ATTInitDate && t.ATTInitDate > endDate) return;
        reportedHHXRAttByCode[t.PrisonOCSCode] = (reportedHHXRAttByCode[t.PrisonOCSCode] || 0) + t.OnATT;
    });

    const monthCount = countUniqueMonths(filteredProgress);

    const rows = [];
    facilities.forEach(f => {
        const code = f.PrisonOCSCode;
        const weeks = reportsCountByCode[code] || 0;
        const campsOrg = reportedCampsByCode[code] || 0;
        const hivTested = reportedHIVByCode[code] || 0;
        const hivPos = reportedHIVPosByCode[code] || 0;
        const onArt = reportedOnARTByCode[code] || 0;
        const tbScreened = reportedTBScreenedByCode[code] || 0;
        const tbPres = reportedTBPresByCode[code] || 0;
        const tbTested = reportedTBTestedByCode[code] || 0;
        const tbDiag = reportedTBDiagByCode[code] || 0;
        const tbAtt = reportedOnATTByCode[code] || 0;
        const hhxrScreened = reportedHHXRScreenedByCode[code] || 0;
        const hhxrPres = reportedHHXRPresByCode[code] || 0;
        const hhxrTested = reportedHHXRTestedByCode[code] || 0;
        const hhxrDiag = reportedHHXRDiagByCode[code] || 0;
        const hhxrAtt = reportedHHXRAttByCode[code] || 0;
        const facTarget = f.Target * monthCount;

        rows.push({
            PrisonOCSCode: code, Name: f.Name, Type: f.Type,
            WeeksReported: weeks, CampsOrganized: campsOrg, Target: facTarget,
            TestedHIV: hivTested, PctAchieved: facTarget > 0 ? (hivTested / facTarget) * 100 : 0,
            HIVPositive: hivPos, OnART: onArt, PctOnART: hivPos > 0 ? (onArt / hivPos) * 100 : 0,
            ScreenedTB: tbScreened, TBPresumptive: tbPres, PctPresumptive: tbScreened > 0 ? (tbPres / tbScreened) * 100 : 0,
            TestedTB: tbTested, PctTested: tbPres > 0 ? (tbTested / tbPres) * 100 : 0,
            DiagnosedTB: tbDiag, PctTBPositivity: tbTested > 0 ? (tbDiag / tbTested) * 100 : 0,
            OnATT: tbAtt, PctOnATT: tbDiag > 0 ? (tbAtt / tbDiag) * 100 : 0,
            HHXRScreened: hhxrScreened, HHXRPresumptive: hhxrPres, PctHHXRPresumptive: hhxrScreened > 0 ? (hhxrPres / hhxrScreened) * 100 : 0,
            HHXRTested: hhxrTested, PctHHXRTested: hhxrPres > 0 ? (hhxrTested / hhxrPres) * 100 : 0,
            HHXRDiagnosed: hhxrDiag, PctHHXRPositive: hhxrTested > 0 ? (hhxrDiag / hhxrTested) * 100 : 0,
            HHXROnATT: hhxrAtt, PctHHXROnATT: hhxrDiag > 0 ? (hhxrAtt / hhxrDiag) * 100 : 0
        });
    });

    return rows;
}

// --- Render functions (mostly unchanged from server version) ---

function renderDashboard() {
    const meta = processDashboardData();
    populateFilters(meta);
    updateOverviewTab();
    updateReportedSummaryTab();
    updateFacilityProgressTab();
}

function populateFilters(meta) {
    const stateSelect = document.getElementById('filterState');
    const curState = stateSelect.value;
    stateSelect.innerHTML = '<option value="All">All States</option>';
    meta.states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.innerText = s; stateSelect.appendChild(opt);
    });
    stateSelect.value = curState;

    const puSelect = document.getElementById('filterPU');
    const curPU = puSelect.value;
    puSelect.innerHTML = '<option value="All">All PUs</option>';
    meta.pus.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.innerText = p; puSelect.appendChild(opt);
    });
    puSelect.value = curPU;

    const typeSelect = document.getElementById('filterPrisonType');
    const curType = typeSelect.value;
    typeSelect.innerHTML = '<option value="All">All Classifications</option>';
    meta.types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.innerText = t; typeSelect.appendChild(opt);
    });
    typeSelect.value = curType;

    document.getElementById('lastLoadedLabel').innerText = 'Data processed in browser';
}

function updateOverviewTab() {
    const data = appState.data;
    if (!data) return;

    let totalTestedHIV = 0, totalScreenedTB = 0, totalHIVPos = 0, totalOnART = 0, totalTBDiag = 0, totalOnATT = 0;

    data.Module2.forEach(row => {
        totalTestedHIV += row.TestedHIV;
        totalScreenedTB += row.ScreenedTB;
        totalHIVPos += row.HIVPositive;
        totalOnART += row.OnART;
        totalTBDiag += row.DiagnosedTB;
        totalOnATT += row.OnATT;
    });

    const overallMonthCount = data.Overview.overallMonthCount || 1;
    const totalRawTarget = data.Overview.totalRawTarget || 0;
    const overallTarget = totalRawTarget * overallMonthCount;

    document.getElementById('metricHIVTested').innerText = totalTestedHIV.toLocaleString();
    document.getElementById('metricHIVPos').innerText = totalHIVPos.toLocaleString();
    document.getElementById('metricTBScreened').innerText = totalScreenedTB.toLocaleString();
    document.getElementById('metricTBDiag').innerText = totalTBDiag.toLocaleString();

    const achieveHIV = overallTarget > 0 ? (totalTestedHIV / overallTarget) * 100 : 0;
    document.getElementById('subHIVTested').innerText = `${achieveHIV.toFixed(1)}% target achieved (Target: ${Math.round(overallTarget).toLocaleString()})`;
    const linkageHIV = totalHIVPos > 0 ? (totalOnART / totalHIVPos) * 100 : 0;
    document.getElementById('subHIVART').innerText = `${totalOnART.toLocaleString()} initiated on ART (${linkageHIV.toFixed(1)}% linkage)`;
    const pctScreenedTB = overallTarget > 0 ? (totalScreenedTB / overallTarget) * 100 : 0;
    document.getElementById('subTBScreened').innerText = `${pctScreenedTB.toFixed(1)}% target screened`;
    const linkageTB = totalTBDiag > 0 ? (totalOnATT / totalTBDiag) * 100 : 0;
    document.getElementById('subTBATT').innerText = `${totalOnATT.toLocaleString()} initiated ATT (${linkageTB.toFixed(1)}% linkage)`;

    renderPrisonPieChart(data.Overview.PrisonPie);
    renderOCSPieChart(data.Overview.OCSPie);
    renderTrendsCharts(data.Overview.Trends);
}

function renderPrisonPieChart(pieData) {
    if (charts.prisonPie) charts.prisonPie.destroy();
    if (!pieData || !pieData.labels.length) return;
    const ctx = document.getElementById('prisonPieChart').getContext('2d');
    charts.prisonPie = new Chart(ctx, {
        type: 'pie',
        data: { labels: pieData.labels, datasets: [{ data: pieData.values, backgroundColor: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#0369a1'], borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', font: { family: 'Outfit', size: 11 } } }, datalabels: { color: '#0b0f19', font: { family: 'Outfit', weight: 'bold', size: 12 }, formatter: v => v.toLocaleString() } } }
    });
}

function renderOCSPieChart(pieData) {
    if (charts.ocsPie) charts.ocsPie.destroy();
    if (!pieData || !pieData.labels.length) return;
    const ctx = document.getElementById('ocsPieChart').getContext('2d');
    charts.ocsPie = new Chart(ctx, {
        type: 'pie',
        data: { labels: pieData.labels, datasets: [{ data: pieData.values, backgroundColor: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5', '#047857', '#065f46'], borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', font: { family: 'Outfit', size: 11 } } }, datalabels: { color: '#0b0f19', font: { family: 'Outfit', weight: 'bold', size: 12 }, formatter: v => v.toLocaleString() } } }
    });
}

function renderTrendsCharts(trends) {
    if (charts.hivTrend) charts.hivTrend.destroy();
    if (charts.tbTrend) charts.tbTrend.destroy();
    if (charts.stiTrend) charts.stiTrend.destroy();
    if (charts.syphilisTrend) charts.syphilisTrend.destroy();
    if (charts.hbvTrend) charts.hbvTrend.destroy();
    if (charts.hcvTrend) charts.hcvTrend.destroy();
    if (!trends || !trends.labels.length) return;
    const ctxHIV = document.getElementById('hivTrendChart').getContext('2d');
    const ctxTB = document.getElementById('tbTrendChart').getContext('2d');
    const ctxSTI = document.getElementById('stiTrendChart').getContext('2d');
    const ctxSyphilis = document.getElementById('syphilisTrendChart').getContext('2d');
    const ctxHBV = document.getElementById('hbvTrendChart').getContext('2d');
    const ctxHCV = document.getElementById('hcvTrendChart').getContext('2d');
    const config = { font: { family: 'Outfit' } };

    charts.hivTrend = new Chart(ctxHIV, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'HIV Testing Cases', data: trends.HIVValues, backgroundColor: '#38bdf8', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });

    charts.tbTrend = new Chart(ctxTB, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'TB Screening Cases', data: trends.TBValues, backgroundColor: '#f59e0b', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });

    charts.stiTrend = new Chart(ctxSTI, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'STI Screening Cases', data: trends.STIValues, backgroundColor: '#a78bfa', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });

    charts.syphilisTrend = new Chart(ctxSyphilis, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'Syphilis Testing Cases', data: trends.SyphilisValues, backgroundColor: '#fb923c', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });

    charts.hbvTrend = new Chart(ctxHBV, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'HBV Testing Cases', data: trends.HBVValues, backgroundColor: '#4ade80', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });

    charts.hcvTrend = new Chart(ctxHCV, {
        type: 'bar',
        data: { labels: trends.labels, datasets: [{ label: 'HCV Testing Cases', data: trends.HCVValues, backgroundColor: '#f472b6', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#e2e8f0', font: config } }, datalabels: { ...dlConfig, formatter: v => v.toLocaleString() } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: config } } } }
    });
}

function updateReportedSummaryTab() {
    const data = appState.data;
    if (!data) return;
    const body = document.getElementById('reportedSummaryBody');
    body.innerHTML = '';

    let tots = { prison:0, reported:0, not:0, d0:0, r1:0, r2:0, r3:0, r4:0, r5:0, target:0, hiv:0, pos:0, art:0, tbs:0, tbp:0, tbt:0, tbd:0, att:0 };
    data.Module2.forEach(row => {
        tots.prison += row.NoOfPrison; tots.reported += row.NoOfPrisonReported; tots.not += row.NoOfPrisonNotReported; tots.d0 += row.NoOfPrisonReported0;
        tots.r1 += row.Reported1; tots.r2 += row.Reported2; tots.r3 += row.Reported3; tots.r4 += row.Reported4; tots.r5 += row.Reported5;
        tots.target += row.MonthlyTarget; tots.hiv += row.TestedHIV; tots.pos += row.HIVPositive; tots.art += row.OnART;
        tots.tbs += row.ScreenedTB; tots.tbp += row.TBPresumptive; tots.tbt += row.TestedTB; tots.tbd += row.DiagnosedTB; tots.att += row.OnATT;
    });

    const totalsTr = document.createElement('tr');
    totalsTr.className = 'total-row';
    totalsTr.innerHTML = `<td style="position:sticky; left:0; z-index:9; background:rgba(30, 41, 59, 0.9);">Total</td>
        <td>${tots.prison}</td><td>${tots.reported}</td><td>${tots.not}</td><td>${formatNum(tots.d0)}</td><td>${formatNum(tots.r1)}</td><td>${formatNum(tots.r2)}</td><td>${formatNum(tots.r3)}</td><td>${formatNum(tots.r4)}</td><td>${formatNum(tots.r5)}</td><td>${formatNum(tots.target)}</td><td>${formatNum(tots.hiv)}</td><td>${formatNum(tots.target>0?tots.hiv/tots.target*100:0, true)}</td><td>${formatNum(tots.pos)}</td><td>${formatNum(tots.art)}</td><td>${formatNum(tots.pos>0?tots.art/tots.pos*100:0, true)}</td>
        <td>${formatNum(tots.tbs)}</td><td>${formatNum(tots.target>0?tots.tbs/tots.target*100:0, true)}</td><td>${formatNum(tots.tbp)}</td><td>${formatNum(tots.tbs>0?tots.tbp/tots.tbs*100:0, true)}</td><td>${formatNum(tots.tbt)}</td><td>${formatNum(tots.tbp>0?tots.tbt/tots.tbp*100:0, true)}</td><td>${formatNum(tots.tbd)}</td><td>${formatNum(tots.tbt>0?tots.tbd/tots.tbt*100:0, true)}</td><td>${formatNum(tots.att)}</td><td>${formatNum(tots.tbd>0?tots.att/tots.tbd*100:0, true)}</td>`;
    body.appendChild(totalsTr);

    data.Module2.forEach(row => {
        if (row.NoOfPrison === 0 && row.TestedHIV === 0 && row.ScreenedTB === 0) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="position:sticky; left:0; z-index:9; background:var(--bg-card); font-weight:600;">${row.Type}</td>
            <td>${row.NoOfPrison}</td><td>${row.NoOfPrisonReported}</td><td>${row.NoOfPrisonNotReported}</td><td>${formatNum(row.NoOfPrisonReported0)}</td><td>${formatNum(row.Reported1)}</td><td>${formatNum(row.Reported2)}</td><td>${formatNum(row.Reported3)}</td><td>${formatNum(row.Reported4)}</td><td>${formatNum(row.Reported5)}</td><td>${formatNum(row.MonthlyTarget)}</td><td>${formatNum(row.TestedHIV)}</td><td>${formatNum(row.PctAchieved, true)}</td><td>${formatNum(row.HIVPositive)}</td><td>${formatNum(row.OnART)}</td><td>${formatNum(row.PctOnART, true)}</td>
            <td>${formatNum(row.ScreenedTB)}</td><td>${formatNum(row.PctTBScreened, true)}</td><td>${formatNum(row.TBPresumptive)}</td><td>${formatNum(row.PctPresumptive, true)}</td><td>${formatNum(row.TestedTB)}</td><td>${formatNum(row.PctTested, true)}</td><td>${formatNum(row.DiagnosedTB)}</td><td>${formatNum(row.PctTBPositivity, true)}</td><td>${formatNum(row.OnATT)}</td><td>${formatNum(row.PctOnATT, true)}</td>`;
        body.appendChild(tr);
    });
}

function updateFacilityProgressTab() {
    if (!appState.data) return;

    const pdf = appState.progressDateFilter;
    const hasDateFilter = pdf.startDate || pdf.endDate;

    let list;
    if (hasDateFilter) {
        list = buildFacilityRowsForDateRange(
            pdf.startDate ? new Date(pdf.startDate) : null,
            pdf.endDate ? new Date(pdf.endDate) : null
        );
    } else {
        list = appState.data.Module3;
    }

    appState.facilityTable.fullList = list;

    const pcSelect = document.getElementById('filterPC');
    const curPC = pcSelect.value;
    const allPCs = [...new Set(list.map(r => r.PrisonOCSCode).filter(Boolean))].sort();
    pcSelect.innerHTML = '<option value="All">All PCs</option>';
    allPCs.forEach(pc => {
        const opt = document.createElement('option');
        opt.value = pc; opt.innerText = pc; pcSelect.appendChild(opt);
    });
    if (allPCs.includes(curPC)) pcSelect.value = curPC;
    else { pcSelect.value = 'All'; appState.facilityTable.pcFilter = 'All'; }

    const pc = appState.facilityTable.pcFilter;
    if (pc !== 'All') list = list.filter(row => row.PrisonOCSCode === pc);

    const totalsRow = list.reduce((acc, row) => {
        acc.WeeksReported += row.WeeksReported || 0;
        acc.CampsOrganized += row.CampsOrganized || 0;
        acc.Target += row.Target || 0;
        acc.TestedHIV += row.TestedHIV || 0;
        acc.HIVPositive += row.HIVPositive || 0;
        acc.OnART += row.OnART || 0;
        acc.ScreenedTB += row.ScreenedTB || 0;
        acc.TBPresumptive += row.TBPresumptive || 0;
        acc.TestedTB += row.TestedTB || 0;
        acc.DiagnosedTB += row.DiagnosedTB || 0;
        acc.OnATT += row.OnATT || 0;
        acc.HHXRScreened += row.HHXRScreened || 0;
        acc.HHXRPresumptive += row.HHXRPresumptive || 0;
        acc.HHXRTested += row.HHXRTested || 0;
        acc.HHXRDiagnosed += row.HHXRDiagnosed || 0;
        acc.HHXROnATT += row.HHXROnATT || 0;
        return acc;
    }, { WeeksReported:0, CampsOrganized:0, Target:0, TestedHIV:0, HIVPositive:0, OnART:0, ScreenedTB:0, TBPresumptive:0, TestedTB:0, DiagnosedTB:0, OnATT:0, HHXRScreened:0, HHXRPresumptive:0, HHXRTested:0, HHXRDiagnosed:0, HHXROnATT:0 });

    const sortBy = appState.facilityTable.sortBy;
    const order = appState.facilityTable.sortOrder === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        let valA = a[sortBy], valB = b[sortBy];
        return (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB) * order;
    });
    const totalCount = list.length;
    const pageSize = appState.facilityTable.pageSize;

    // Update sort indicators in header
    document.querySelectorAll('#progressFacilityTable thead th[data-sort]').forEach(th => {
        const field = th.getAttribute('data-sort');
        const label = th.getAttribute('data-label') || th.innerText.replace(/ [▲▼]$/, '');
        if (!th.getAttribute('data-label')) th.setAttribute('data-label', label);
        if (field === sortBy) {
            th.innerHTML = label + (appState.facilityTable.sortOrder === 'asc' ? ' ▲' : ' ▼');
        } else {
            th.innerHTML = label;
        }
    });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (appState.facilityTable.currentPage > totalPages) appState.facilityTable.currentPage = totalPages;

    const startIdx = (appState.facilityTable.currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalCount);
    const paginatedList = list.slice(startIdx, endIdx);

    const body = document.getElementById('progressFacilityBody');
    body.innerHTML = '';

    if (paginatedList.length === 0) {
        body.innerHTML = `<tr><td colspan="29" style="text-align:center; padding: 40px; color:var(--text-muted);">No matching facility records found.</td></tr>`;
        document.getElementById('paginationInfo').innerText = 'Showing 0-0 of 0 facilities';
        document.getElementById('prevPageBtn').disabled = true; document.getElementById('nextPageBtn').disabled = true;
        return;
    }

    const t = totalsRow;
    const totalTr = document.createElement('tr');
    totalTr.className = 'total-row';
    totalTr.innerHTML = `<td style="position:sticky; left:0; z-index:9; background:rgba(30, 41, 59, 0.9); font-weight:700;">Total</td>
        <td style="font-weight:700;">—</td><td>—</td><td>${t.WeeksReported}</td><td>${formatNum(t.CampsOrganized)}</td><td>${formatNum(t.Target)}</td>
        <td>${formatNum(t.TestedHIV)}</td><td>${formatNum(t.Target>0?t.TestedHIV/t.Target*100:0, true, 1)}</td><td>${formatNum(t.HIVPositive)}</td><td>${formatNum(t.OnART)}</td><td>${formatNum(t.HIVPositive>0?t.OnART/t.HIVPositive*100:0, true, 0)}</td>
        <td>${formatNum(t.ScreenedTB)}</td><td>${formatNum(t.TBPresumptive)}</td><td>${formatNum(t.ScreenedTB>0?t.TBPresumptive/t.ScreenedTB*100:0, true, 1)}</td><td>${formatNum(t.TestedTB)}</td><td>${formatNum(t.TBPresumptive>0?t.TestedTB/t.TBPresumptive*100:0, true, 1)}</td>
        <td>${formatNum(t.DiagnosedTB)}</td><td>${formatNum(t.TestedTB>0?t.DiagnosedTB/t.TestedTB*100:0, true, 1)}</td><td>${formatNum(t.OnATT)}</td><td>${formatNum(t.DiagnosedTB>0?t.OnATT/t.DiagnosedTB*100:0, true, 1)}</td>
        <td>${formatNum(t.HHXRScreened)}</td><td>${formatNum(t.HHXRPresumptive)}</td><td>${formatNum(t.HHXRScreened>0?t.HHXRPresumptive/t.HHXRScreened*100:0, true, 1)}</td><td>${formatNum(t.HHXRTested)}</td><td>${formatNum(t.HHXRPresumptive>0?t.HHXRTested/t.HHXRPresumptive*100:0, true, 1)}</td>
        <td>${formatNum(t.HHXRDiagnosed)}</td><td>${formatNum(t.HHXRTested>0?t.HHXRDiagnosed/t.HHXRTested*100:0, true, 1)}</td><td>${formatNum(t.HHXROnATT)}</td><td>${formatNum(t.HHXRDiagnosed>0?t.HHXROnATT/t.HHXRDiagnosed*100:0, true, 1)}</td>`;
    body.appendChild(totalTr);

    paginatedList.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><code class="badge badge-primary">${row.PrisonOCSCode}</code></td><td style="font-weight:600; white-space:normal; min-width:200px;">${row.Name}</td><td>${row.Type}</td><td>${row.WeeksReported}</td><td>${formatNum(row.CampsOrganized)}</td><td>${formatNum(row.Target)}</td><td>${formatNum(row.TestedHIV)}</td><td>${formatNum(row.PctAchieved, true, 1)}</td><td>${formatNum(row.HIVPositive)}</td><td>${formatNum(row.OnART)}</td><td>${formatNum(row.PctOnART, true, 0)}</td><td>${formatNum(row.ScreenedTB)}</td><td>${formatNum(row.TBPresumptive)}</td><td>${formatNum(row.PctPresumptive, true, 1)}</td><td>${formatNum(row.TestedTB)}</td><td>${formatNum(row.PctTested, true, 1)}</td><td>${formatNum(row.DiagnosedTB)}</td><td>${formatNum(row.PctTBPositivity, true, 1)}</td><td>${formatNum(row.OnATT)}</td><td>${formatNum(row.PctOnATT, true, 1)}</td><td>${formatNum(row.HHXRScreened)}</td><td>${formatNum(row.HHXRPresumptive)}</td><td>${formatNum(row.PctHHXRPresumptive, true, 1)}</td><td>${formatNum(row.HHXRTested)}</td><td>${formatNum(row.PctHHXRTested, true, 1)}</td><td>${formatNum(row.HHXRDiagnosed)}</td><td>${formatNum(row.PctHHXRPositive, true, 1)}</td><td>${formatNum(row.HHXROnATT)}</td><td>${formatNum(row.PctHHXROnATT, true, 1)}</td>`;
        body.appendChild(tr);
    });

    document.getElementById('paginationInfo').innerText = `Showing ${startIdx + 1}-${endIdx} of ${totalCount} facilities`;
    document.getElementById('prevPageBtn').disabled = appState.facilityTable.currentPage === 1;
    document.getElementById('nextPageBtn').disabled = appState.facilityTable.currentPage === totalPages;
}

// --- Event Listeners ---

document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    appState.filters.state = document.getElementById('filterState').value;
    appState.filters.facilityType = document.getElementById('filterFacilityType').value;
    appState.filters.prisonType = document.getElementById('filterPrisonType').value;
    appState.filters.pu = document.getElementById('filterPU').value;
    renderDashboard();
});

document.getElementById('trendGroupBy').addEventListener('change', (e) => {
    appState.filters.groupBy = e.target.value;
    renderDashboard();
});

document.getElementById('applyProgressDateBtn').addEventListener('click', () => {
    appState.progressDateFilter.startDate = document.getElementById('filterProgressStartDate').value;
    appState.progressDateFilter.endDate = document.getElementById('filterProgressEndDate').value;
    appState.facilityTable.currentPage = 1;
    updateFacilityProgressTab();
});

document.getElementById('githubLoadBtn').addEventListener('click', loadAllFromGitHub);

document.getElementById('syncDataBtn').addEventListener('click', () => {
    const allLoaded = Object.values(appState.filesLoaded).every(v => v);
    if (!allLoaded) {
        alert('Please upload all four Excel files before synchronizing.');
        return;
    }
    Object.keys(appState.staged).forEach(type => {
        if (appState.staged[type] !== null) {
            appState.raw[type] = appState.staged[type];
            appState.staged[type] = null;
        }
    });
    saveRawToStorage();
    showSpinner('Processing data...');
    setTimeout(() => {
        renderDashboard();
        navigateToSection('overviewSection');
        hideSpinner();
    }, 50);
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (!appState.data || !appState.data.Module3) {
        alert('No data available to export.');
        return;
    }
    const data = appState.facilityTable.fullList || appState.data.Module3;
    if (data.length === 0) { alert('No records found to export.'); return; }
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    data.forEach(row => {
        const values = headers.map(header => {
            const val = row[header];
            const escaped = ('' + val).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    });
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Subhiksha_Facility_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (appState.facilityTable.currentPage > 1) {
        appState.facilityTable.currentPage--;
        updateFacilityProgressTab();
    }
});
document.getElementById('nextPageBtn').addEventListener('click', () => {
    appState.facilityTable.currentPage++;
    updateFacilityProgressTab();
});
document.getElementById('filterPC').addEventListener('change', (e) => {
    appState.facilityTable.pcFilter = e.target.value;
    appState.facilityTable.currentPage = 1;
    updateFacilityProgressTab();
});

document.querySelectorAll('#progressFacilityTable thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const sortBy = th.getAttribute('data-sort');
        if (appState.facilityTable.sortBy === sortBy) {
            appState.facilityTable.sortOrder = appState.facilityTable.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            appState.facilityTable.sortBy = sortBy;
            appState.facilityTable.sortOrder = 'asc';
        }
        appState.facilityTable.currentPage = 1;
        updateFacilityProgressTab();
    });
});

// --- Restore from localStorage ---

function restoreSavedFiles() {
    const payload = loadRawFromStorage();
    if (payload && payload.data) {
        appState.raw = payload.data;
        appState.filesLoaded = payload.filesLoaded || { facility: false, progress: false, hiv: false, tb: false };
        restoreDatesInPlace(appState.raw.progress, DATE_FIELDS_PROGRESS);
        restoreDatesInPlace(appState.raw.hiv, DATE_FIELDS_HIV);
        restoreDatesInPlace(appState.raw.tb, DATE_FIELDS_TB);
        appState.raw.progress.forEach(p => {
            p.PU = calculatePU(p.ReportingMonth || p.EndDate);
            if (p.CampsOrganized === undefined) p.CampsOrganized = 0;
            if (p.STIScreened === undefined) p.STIScreened = 0;
            if (p.SyphilisTested === undefined) p.SyphilisTested = 0;
            if (p.HBVTested === undefined) p.HBVTested = 0;
            if (p.HCVTested === undefined) p.HCVTested = 0;
        });

        const allLoaded = Object.values(appState.filesLoaded).every(v => v);
        if (allLoaded) {
            const counts = {
                facility: appState.raw.facility.length,
                progress: appState.raw.progress.length,
                hiv: appState.raw.hiv.length,
                tb: appState.raw.tb.length
            };
            Object.keys(counts).forEach(k => updateFileBadge(k, counts[k]));

            const label = payload.savedAt
                ? 'Restored from ' + new Date(payload.savedAt).toLocaleDateString()
                : 'Restored from browser storage';
            document.getElementById('lastLoadedLabel').innerText = label;

            renderDashboard();
            navigateToSection('overviewSection');
            return true;
        }
    }
    navigateToSection('uploadSection');
    return false;
}

// --- Init ---

(async function init() {
    if (restoreSavedFiles()) return;
    try {
        await loadFromJSON(JSON_FILES, 'Loaded from local files');
    } catch (e) {
        console.info('Local JSON not available, trying GitHub...');
        await loadAllFromGitHub();
    }
})();
