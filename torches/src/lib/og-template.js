// Shared Satori JSX-ish template helpers for OG images.
// Satori accepts a React-like object tree — no JSX required.

export const COLORS = {
  bgTop: '#0b1220',
  bgBottom: '#1a0f2e',
  orange: '#f97316',
  pink: '#ec4899',
  amber: '#fbbf24',
  text: '#ffffff',
  dim: '#94a3b8',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

export function scoreColor(score) {
  if (score >= 80) return COLORS.green;
  if (score >= 60) return COLORS.yellow;
  return COLORS.red;
}

export function truncate(str, max) {
  const s = String(str || '').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Base background frame — dark gradient + grid glow + orange/pink accents.
export function bgFrame(children, { accent = COLORS.orange } = {}) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '64px 72px',
        background: `linear-gradient(135deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: COLORS.text,
        position: 'relative',
      },
      children: [
        // Top gradient bar
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0, left: 0, right: 0,
              height: '6px',
              background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.pink})`,
            },
          },
        },
        // Corner glow
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '-200px', right: '-200px',
              width: '500px', height: '500px',
              borderRadius: '500px',
              background: `radial-gradient(circle, ${accent}44 0%, transparent 70%)`,
            },
          },
        },
        // Bottom-left subtle glow
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-150px', left: '-150px',
              width: '400px', height: '400px',
              borderRadius: '400px',
              background: `radial-gradient(circle, ${COLORS.pink}33 0%, transparent 70%)`,
            },
          },
        },
        ...children,
      ],
    },
  };
}

// Top brand row — DateWizza logo text + tagline
export function brandRow() {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '52px', height: '52px',
                    borderRadius: '14px',
                    background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.pink})`,
                    fontSize: '30px',
                    fontWeight: 900,
                  },
                  children: '🔥',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '26px', fontWeight: 900, letterSpacing: '-0.5px' },
                        children: 'DateWizza',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '14px', color: COLORS.dim, fontWeight: 500 },
                        children: 'Free SEO · UX · AEO audits',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: '15px',
              color: COLORS.dim,
              fontWeight: 600,
              letterSpacing: '0.5px',
            },
            children: 'datewizza.com',
          },
        },
      ],
    },
  };
}

// Score badge — big number in a circle
export function scoreBadge(score) {
  const color = scoreColor(score);
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        width: '220px', height: '220px',
        borderRadius: '220px',
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        border: `6px solid ${color}`,
        flexShrink: 0,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: '110px',
              fontWeight: 900,
              color,
              lineHeight: 1,
              letterSpacing: '-4px',
            },
            children: String(score),
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: '20px', color: COLORS.dim, fontWeight: 700, marginTop: '4px' },
            children: '/ 100',
          },
        },
      ],
    },
  };
}
