import { m, useReducedMotion } from 'motion/react';

import { PRODUCT_URL } from '../constants';
import { ProductWordmark } from './product-mark';

const runtimeStages = [
  ['01', 'Question', 'A tenant-scoped question opens a durable run.'],
  ['02', 'Semantic query', 'The Analyst can use governed business definitions only.'],
  ['03', 'Independent evaluation', 'A separate agent re-derives the result and bounds confidence.'],
  ['04', 'Decision', 'Policy asks for a human when the evidence is not enough.'],
  ['05', 'Replay', 'The process survives the answer as a traceable record.'],
] as const;

const boundaries = [
  ['Workflow roles', 'Specialists are registered and evaluation-gated before they run.'],
  ['Data scope', 'Connections resolve through tenant-scoped semantic catalogs.'],
  ['Evidence rules', 'Claims carry typed evidence, confidence bounds, and contradictions.'],
  ['Decision authority', 'Approval is an explicit product state, never an afterthought.'],
] as const;

const architecture = [
  ['01', 'React + Nx', 'A responsive workspace for system state, approvals, and replay.'],
  ['02', 'FastAPI control plane', 'Authenticated tenant resolution and durable jobs.'],
  ['03', 'Agent runtime', 'Analyst, Evaluator, Orchestrator, and Insight roles.'],
  ['04', 'Governed data', 'Cube-backed semantics constrain analytical access.'],
  ['05', 'Durable record', 'Postgres operational state and ClickHouse audit metadata.'],
] as const;

export const PlatformPage = () => {
  const reduceMotion = useReducedMotion();
  const enter = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="platform-page">
      <header className="platform-header">
        <a className="platform-header__brand" href="/" aria-label="Nexus home">
          <ProductWordmark />
          <span>Platform</span>
        </a>
        <nav aria-label="Platform navigation">
          <a href="#runtime">Runtime</a>
          <a href="#controls">Controls</a>
          <a href="#architecture">Architecture</a>
        </nav>
      </header>

      <main>
        <section className="platform-hero" aria-labelledby="platform-title">
          <div className="platform-hero__grain" aria-hidden="true" />
          <m.div
            className="platform-hero__copy"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <m.p className="platform-kicker" variants={enter}>Nexus / Platform systems</m.p>
            <m.h1 id="platform-title" variants={enter}>Agentic work needs a control plane.</m.h1>
            <m.p className="platform-hero__lede" variants={enter}>
              Nexus gives teams a governed surface for building, running, reviewing, and replaying
              analytical workflows over their own data.
            </m.p>
            <m.div className="platform-hero__actions" variants={enter}>
              <a className="platform-action" href={PRODUCT_URL}>Explore Nexus <span>↗</span></a>
              <a className="platform-text-link" href="#runtime">Read the system <span>↓</span></a>
            </m.div>
          </m.div>

          <m.div
            className="hero-run"
            initial={{ opacity: 0, x: reduceMotion ? 0 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.85, delay: 0.15 }}
            aria-label="A governed analysis run with completed, review, and audit states"
          >
            <div className="hero-run__topline"><span>RUN / 042</span><span>GOVERNED</span></div>
            <div className="hero-run__question">
              <span>Question</span>
              <strong>Which revenue segment changed most this quarter?</strong>
            </div>
            <div className="hero-run__path" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="hero-run__steps">
              <div><span>01</span><strong>Analyst</strong><em>complete</em></div>
              <div><span>02</span><strong>Evaluator</strong><em>verified</em></div>
              <div><span>03</span><strong>Insight</strong><em>drafted</em></div>
              <div><span>04</span><strong>Approval</strong><em>review</em></div>
            </div>
            <div className="hero-run__finding">
              <span>Validated finding</span>
              <p>EMEA enterprise expansion accounts for the largest quarter-over-quarter gain.</p>
              <div><b>Evidence attached</b><b>Recheck converged</b></div>
            </div>
            <div className="hero-run__footer"><span>SEMANTIC DATA ACCESS</span><span>REPLAY READY</span></div>
          </m.div>
          <p className="platform-hero__side-note">Designed for human judgment at the edge of automation.</p>
        </section>

        <section className="platform-manifesto" aria-labelledby="manifesto-title">
          <div className="platform-manifesto__rule" aria-hidden="true" />
          <m.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
          >
            <p className="platform-kicker">The platform thesis</p>
            <h2 id="manifesto-title">Make the work inspectable before making it autonomous.</h2>
            <p>
              A workflow is only useful when operators can understand what it can access, how it was
              validated, and who has the authority to act on its output. Nexus turns those constraints
              into product primitives.
            </p>
          </m.div>
        </section>

        <section className="platform-runtime" id="runtime" aria-labelledby="runtime-title">
          <div className="platform-runtime__intro">
            <p className="platform-kicker">02 / Runtime</p>
            <h2 id="runtime-title">A record that stays with the work.</h2>
            <p>Every run begins with a bounded question and ends with a decision that can be inspected later.</p>
          </div>
          <div className="runtime-system">
            <div className="runtime-system__signal" aria-hidden="true">
              <span>Run / 042</span><i /><i /><i /><i /><b>Decision</b>
            </div>
            <ol className="runtime-rail">
              {runtimeStages.map(([index, title, description]) => (
                <m.li
                  key={index}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.45, delay: Number(index) * 0.05 }}
                >
                  <span>{index}</span><h3>{title}</h3><p>{description}</p>
                </m.li>
              ))}
            </ol>
          </div>
        </section>

        <section className="platform-controls" id="controls" aria-labelledby="controls-title">
          <div className="platform-controls__intro">
            <p className="platform-kicker">02 / Controls</p>
            <h2 id="controls-title">Flexible where the work changes. Strict where trust depends on it.</h2>
            <p>People can shape the workflow. The system keeps the controls around data, evidence, and decisions explicit.</p>
          </div>
          <div className="control-matrix">
            <div className="control-matrix__axis"><span>Configurable</span><span>Enforced</span></div>
            {boundaries.map(([title, description], index) => (
              <m.article
                key={title}
                initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
              >
                <span>0{index + 1}</span><h3>{title}</h3><p>{description}</p><i aria-hidden="true" />
              </m.article>
            ))}
          </div>
        </section>

        <section className="platform-interface" aria-labelledby="interface-title">
          <div className="platform-interface__number">04</div>
          <div>
            <p className="platform-kicker">The frontend system</p>
            <h2 id="interface-title">The interface is where an agent becomes operational software.</h2>
          </div>
          <div className="platform-interface__copy">
            <p>Queued, running, evaluated, approval-required, completed, and failed are different product states—not one generic loading experience.</p>
            <p>Nexus makes handoffs, evidence, retries, and choices legible while keeping hidden reasoning and raw customer rows out of the interface.</p>
            <div className="interface-states"><span>Queued</span><span>Evaluated</span><span>Approval required</span><span>Replay ready</span></div>
          </div>
        </section>

        <section className="platform-architecture" id="architecture" aria-labelledby="architecture-title">
          <div className="platform-section-head">
            <p className="platform-kicker">05 / Architecture</p>
            <h2 id="architecture-title">A platform with clear seams.</h2>
          </div>
          <div className="architecture-stack">
            {architecture.map(([index, title, description]) => (
              <article key={index}><span>{index}</span><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </section>

        <section className="platform-scope" aria-labelledby="scope-title">
          <div className="platform-scope__meta"><p className="platform-kicker">06 / Scope</p></div>
          <div className="platform-scope__content">
            <h2 id="scope-title">A real system, with an honest edge.</h2>
            <p>Nexus demonstrates governed analytical workflows today. The direction is safe workflow composition—not a claim that every arbitrary agent workflow is already self-service or infallible.</p>
            <div><span>Next / safer composition</span><span>Next / sharper planning</span><span>Next / operator diagnostics</span></div>
          </div>
        </section>

        <section className="platform-close" aria-labelledby="close-title">
          <p className="platform-kicker">Nexus / governed intelligence</p>
          <h2 id="close-title">Build workflows people can trust.</h2>
          <a className="platform-action" href={PRODUCT_URL}>Open Nexus <span>↗</span></a>
        </section>
      </main>
      <footer className="platform-footer"><span>Nexus by OpenZentra</span><a href="/">Home</a></footer>
    </div>
  );
};
