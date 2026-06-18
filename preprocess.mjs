import XLSX from 'xlsx';
import { writeFileSync } from 'fs';

const FILES = [
  { file: 'Facility_Data.xlsx', sheet: 'Facility Data', out: 'facility.json' },
  { file: '1_P&OCS Progress.xlsx', sheet: 'Prison-OCS Progress', out: 'progress.json' },
  { file: '2_HIV_Positive.xlsx', sheet: 'HIV Testing Record', out: 'hiv.json' },
  { file: '3_TB Positive.xlsx', sheet: 'TB', out: 'tb.json' }
];

// --- Helper functions (mirror dashboard) ---

function xlToDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString();
    const parts = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (parts) return new Date(+parts[3], +parts[1] - 1, +parts[2]).toISOString();
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
  return undefined;
}

// --- Process each file ---

for (const { file, sheet, out } of FILES) {
  console.log(`Reading ${file}...`);
  const wb = XLSX.readFile(file, { cellDates: true });
  const ws = wb.Sheets[sheet] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  let parsed;

  if (file.startsWith('Facility')) {
    parsed = rows.map(r => ({
      FacilityAppID: ('' + (r['Facility AppID'] || '')).trim(),
      Name: ('' + (r['Name of Prison/OCS'] || '')).trim(),
      Type: ('' + (r['Type of Prison/OCS'] || '')).trim(),
      FacilityType: ('' + (r['Type of Facility'] || '')).trim(),
      State: ('' + (r['Address--State'] || '')).trim(),
      Target: toNum(r['Monthly Target']),
      PrisonOCSCode: ('' + (r['Prison/OCS ID'] || '')).trim(),
      CreatedByUser: ('' + (r['Created By User'] || '')).trim()
    })).filter(f => f.PrisonOCSCode !== '');
  } else if (file.startsWith('1_P&OCS')) {
    parsed = rows.map(r => {
      const code = ('' + getCol(r, ['Prison/OCS - ID']) || '').trim();
      if (!code) return null;
      const c10S = toNum(getCol(r, ['Number of inmates screened for TB through 10S--.Total']));
      const cDD = toNum(getCol(r, ['Number of inmates screened for TB through Handheld X-ray-- .Total', 'Number of inmates screened for TB through Handheld X-ray--.Total']));
      const cDH = toNum(getCol(r, ['Number of inmates found TB Symptomatic during the reporting month--.Total']));
      const cDL = toNum(getCol(r, ['Number of symptomatic inmates tested for TB testing during the reporting month--.Total']));
      const c4S = toNum(getCol(r, ['Number of inmates screened for TB through 4S+--.Total']));
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
        ScreenedTB: c10S + cDD + c4S,
        TBPresumptive: cDH,
        TestedTB: cDL,
        HHXRScreened: cDD,
        HHXRPresumptive: cDH,
        HHXRTested: cDL,
        CampsOrganized: campsProject + campsPrison,
        STIScreened: stiScreened,
        SyphilisTested: syphilisTested,
        HBVTested: hbvTested,
        HCVTested: hcvTested
      };
    }).filter(r => r !== null);
  } else if (file.startsWith('2_HIV')) {
    parsed = rows.map(r => {
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
  } else if (file.startsWith('3_TB')) {
    parsed = rows.map(r => {
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

  writeFileSync(out, JSON.stringify(parsed));
  console.log(`  → ${out}: ${parsed.length} rows written`);
}

console.log('Done.');
