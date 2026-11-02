// Chart theme tokens and options for the reports page. Extracted verbatim from
// Reports.jsx; module scope means they are built once, not per render.

// ─── Chart theme tokens ───────────────────────────────────────────────────
const slateLabel = 'rgba(148, 163, 184, 1)';  // slate-400
const slateGrid  = 'rgba(51,  65,  85,  0.6)'; // slate-700/60
const tooltipBg  = 'rgba(15,  23,  42,  0.95)'; // slate-950

const baseAxisOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { usePointStyle: true, boxWidth: 10, color: slateLabel, font: { size: 12 } }
    },
    tooltip: {
      backgroundColor: tooltipBg,
      titleColor: '#f1f5f9',
      bodyColor: slateLabel,
      borderColor: 'rgba(51, 65, 85, 0.7)',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: slateLabel },
      border: { color: slateGrid }
    },
    y: {
      beginAtZero: true,
      ticks: { precision: 0, color: slateLabel },
      grid: { color: slateGrid },
      border: { color: slateGrid }
    }
  }
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { usePointStyle: true, boxWidth: 10, color: slateLabel, font: { size: 12 } }
    },
    tooltip: {
      backgroundColor: tooltipBg,
      titleColor: '#f1f5f9',
      bodyColor: slateLabel,
      borderColor: 'rgba(51, 65, 85, 0.7)',
      borderWidth: 1
    }
  },
  cutout: '60%'
};

// ─── Chart palette (brighter for dark surfaces) ───────────────────────────
const chartPalette = {
  blue:        'rgba(56,  189, 248, 0.75)', // sky-400
  blueBorder:  'rgba(14,  165, 233, 1)',     // sky-500
  green:       'rgba(52,  211, 153, 0.75)', // emerald-400
  greenBorder: 'rgba(16,  185, 129, 1)',     // emerald-500
  yellow:      'rgba(251, 191, 36,  0.75)', // amber-400
  red:         'rgba(251, 113, 133, 0.75)', // rose-400
  purple:      'rgba(192, 132, 252, 0.75)', // purple-400
  gray:        'rgba(100, 116, 139, 0.75)'  // slate-500
};

// Doughnut segment separator matches dark surface
const doughnutBorder = 'rgba(15, 23, 42, 0.8)';

export { baseAxisOptions, doughnutOptions, chartPalette, doughnutBorder };
