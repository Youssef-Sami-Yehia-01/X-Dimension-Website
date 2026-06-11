'use client'

import { useStore } from '@/store/useStore'
import { PROJECTS } from '@/config/journey'
import styles from './ProjectUI.module.css'

/*
 * ProjectUI — overlay while orbiting a project scan.
 * Left panel tells the project's story; the visitor is free to inspect the
 * actual point cloud (drag / zoom / pan) the whole time.
 */
export default function ProjectUI() {
  const projectState  = useStore(s => s.projectState)
  const activeProject = useStore(s => s.activeProject)
  const closeProject  = useStore(s => s.closeProject)

  if (projectState !== 'showing') return null

  const project = PROJECTS[activeProject]
  if (!project) return null

  return (
    <div className={styles.ui}>
      <button className={styles.backBtn} onClick={closeProject}>
        ← Back to the street
      </button>

      <aside className={styles.panel}>
        <p className={styles.kicker}>Project scan</p>
        <h2 className={styles.title}>{project.name}</h2>
        <p className={styles.subtitle}>{project.subtitle}</p>
        <p className={styles.description}>{project.description}</p>

        <dl className={styles.facts}>
          {project.facts.map(({ label, value }) => (
            <div key={label} className={styles.fact}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </aside>

      <p className={styles.hint}>Drag to orbit · Scroll to zoom · Right-click to pan</p>
    </div>
  )
}
