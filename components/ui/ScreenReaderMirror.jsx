import { SECTIONS, PROJECTS } from '@/config/journey'

/*
 * ScreenReaderMirror — the journey's full content as semantic HTML,
 * visually hidden. The 3D canvas is aria-hidden noise to assistive tech;
 * this mirror is what a screen reader actually gets. Rendered on the
 * server (no 'use client'), so it's also what crawlers index.
 */
export default function ScreenReaderMirror() {
  return (
    <div className="srOnly">
      <h1>X-Dimension — Reality, Captured. Laser scanning &amp; BIM, Egypt.</h1>

      {SECTIONS.map((s) => (
        <section key={s.id} aria-label={s.label}>
          <h2>{s.title.replace('\n', ' ')}</h2>
          {s.body && <p>{s.body}</p>}

          {s.services && (
            <ul>
              {s.services.map(svc => (
                <li key={svc.name}><strong>{svc.name}</strong> — {svc.desc}</li>
              ))}
            </ul>
          )}

          {s.stats && (
            <ul>
              {s.stats.map(st => (
                <li key={st.label}>{st.value}{st.suffix} {st.label.toLowerCase()}</li>
              ))}
            </ul>
          )}

          {s.type === 'careers' && <a href={`mailto:${s.cta}`}>{s.cta}</a>}
          {s.email && (
            <p>
              <a href={`mailto:${s.email}`}>{s.email}</a> · {s.location}
            </p>
          )}
        </section>
      ))}

      {Object.values(PROJECTS).map((p) => (
        <section key={p.name} aria-label={`Project: ${p.name}`}>
          <h2>{p.name}</h2>
          <p>{p.subtitle}</p>
          <p>{p.description}</p>
          <dl>
            {p.facts.map(f => (
              <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
