import { m, useReducedMotion } from 'motion/react';

import { LANDING_URL, PRODUCT_URL } from '../constants';
import { ProductWordmark } from './product-mark';

const runtimeStages = [
  ['01', 'Question', 'A tenant-scoped business question starts a durable run.'],
  ['02', 'Governed query', 'The Analyst works only through approved semantic definitions.'],
  ['03', 'Independent check', 'The Evaluator re-derives the result and bounds confidence.'],
  ['04', 'Human decision', 'Policy opens approval when automation should stop.'],
  ['05', 'Replay', 'Evidence, decisions, and attribution remain traceable.'],
] as const;

const boundaries = [
  ['Workflow roles', 'Registered and evaluation-gated before they can run.'],
  ['Data connections', 'Tenant-scoped semantic catalogs, not arbitrary schemas.'],
  ['Evidence and outcomes', 'Typed evidence, confidence bounds, and visible contradictions.'],
  ['Human operations', 'Explicit approval authority at irreversible edges.'],
] as const;

const architecture = [
  ['React + Nx', 'A responsive workspace for workflows, state, approvals, and replay.'],
  ['FastAPI control plane', 'Authenticated tenant resolution and durable job lifecycle.'],
  ['Agent runtime', 'Registered Analyst, Evaluator, Orchestrator, and Insight roles.'],
  ['Governed data layer', 'Cube-backed semantics constrain how agents retrieve measures.'],
  ['Durable records', 'Postgres operational state plus ClickHouse audit metadata.'],
] as const;

export const PlatformPage = () => {
  const reduceMotion = useReducedMotion();
  const intro = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="platform-page">
      <header className="platform-header">
        <a className="platform-header__brand" href="/" aria-label="Nexus home">
          <ProductWordmark />
        </a>
        <nav aria-label="Platform navigation">
          <a href="#runtime">Runtime</a>
          <a href="#boundaries">Boundaries</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <a className="platform-header__product" href={PRODUCT_URL}>Open Nexus ↗</a>
      </header>

      <main>
        <section className="platform-hero" aria-labelledby="platform-title">
          <div className="platform-hero__grid" aria-hidden="true" />
          <m.div
            className="platform-hero__content"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <m.p className="eyebrow platform-hero__eyebrow" variants={intro}>Nexus / platform</m.p>
            <m.h1 id="platform-title" variants={intro}>The governed platform for agentic workflows.</m.h1>
            <m.p className="platform-hero__lede" variants={intro}>
              Bring data and define meaningful work without surrendering the boundaries that make
              an agent trustworthy in production.
            </m.p>
            <m.div className="platform-hero__actions" variants={intro}>
              <a className="platform-action" href={PRODUCT_URL}>Explore the product ↗</a>
              <a className="platform-link" href="#runtime">Inspect the runtime ↓</a>
            </m.div>
          </m.div>
          <m.div
            className="execution-topology"
            aria-label="The Nexus workflow: question, governed query, independent evaluation, human decision, and replay"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="execution-topology__line execution-topology__line--one" aria-hidden="true" />
            <div className="execution-topology__line execution-topology__line--two" aria-hidden="true" />
            <div className="execution-topology__line execution-topology__line--three" aria-hidden="true" />
            <span className="execution-node execution-node--question">Question</span>
            <span className="execution-node execution-node--query">Semantic<br />query</span>
            <span className="execution-node execution-node--evaluate">Independent<br />evaluation</span>
            <span className="execution-node execution-node--decision">Human<br />decision</span>
            <span className="execution-node execution-node--replay">Replay</span>
            <span className="execution-topology__signal" aria-hidden="true" />
          </m.div>
        </section>

        <section className="platform-section platform-thesis" aria-labelledby="platform-thesis-title">
          <m.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.55 }}
          >
            <p className="platform-overline">The product thesis</p>
            <h2 id="platform-thesis-title">Extensibility without invisible automation.</h2>
            <p>
              Generic workflows are useful only when a user can understand the data boundary,
              validation path, and decision authority behind them. Nexus makes those conditions
              part of the product surface, not an implementation detail.
            </p>
          </m.div>
        </section>

        <section className="platform-section platform-runtime" id="runtime" aria-labelledby="runtime-title">
          <div className="platform-section__label">01 / Runtime</div>
          <div className="platform-section__heading">
            <h2 id="runtime-title">A question becomes a finding through visible work.</h2>
            <p>Each stage has a distinct responsibility, state, and operational consequence.</p>
          </div>
          <ol className="runtime-list">
            {runtimeStages.map(([index, title, description]) => (
              <m.li
                key={index}
                initial={{ opacity: 0, x: reduceMotion ? 0 : -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: Number(index) * 0.04 }}
              >
                <span>{index}</span><h3>{title}</h3><p>{description}</p>
              </m.li>
            ))}
          </ol>
        </section>

        <section className="platform-boundaries" id="boundaries" aria-labelledby="boundaries-title">
          <div className="platform-section platform-boundaries__inner">
            <div className="platform-section__label">02 / Boundaries</div>
            <div className="platform-boundaries__header">
              <h2 id="boundaries-title">What can change—and what must remain enforced.</h2>
              <p>Workflows can grow. The controls around data, evidence, and approval should not disappear as they do.</p>
            </div>
            <div className="boundary-list">
              {boundaries.map(([title, description], index) => (
                <m.article
                  key={title}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.5, delay: index * 0.06 }}
                >
                  <span>0{index + 1}</span><h3>{title}</h3><p>{description}</p>
                </m.article>
              ))}
            </div>
          </div>
        </section>

        <section className="platform-section platform-frontend" aria-labelledby="frontend-title">
          <div className="platform-section__label">03 / Frontend system</div>
          <div className="platform-frontend__layout">
            <div>
              <h2 id="frontend-title">The frontend is where an agent becomes operational software.</h2>
            </div>
            <div className="platform-frontend__copy">
              <p>Queued, running, evaluated, approval-required, completed, and failed are different product states—not one generic loading experience.</p>
              <p>That means making handoffs, evidence, retries, and choices legible while keeping hidden reasoning and raw customer rows out of the interface.</p>
              <p>It also means responsive, accessible primitives that stay coherent as agents, workflows, and deployment options grow.</p>
            </div>
          </div>
        </section>

        <section className="platform-section platform-architecture" id="architecture" aria-labelledby="platform-architecture-title">
          <div className="platform-section__label">04 / Architecture</div>
          <div className="platform-section__heading">
            <h2 id="platform-architecture-title">Clear seams make the platform easier to evolve.</h2>
          </div>
          <div className="architecture-list">
            {architecture.map(([title, description]) => (
              <article key={title}><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </section>

        <section className="platform-section platform-scope" aria-labelledby="scope-title">
          <div className="platform-section__label">05 / Scope</div>
          <h2 id="scope-title">Built for a real system, not a perfect demo.</h2>
          <p>
            Nexus currently demonstrates governed analytical workflows and their trust surface. The
            broader direction is safe workflow composition—not a claim that every arbitrary agent
            workflow is already self-service or infallible.
          </p>
          <div className="scope-points">
            <span>Next: safer composition</span><span>Next: sharper follow-up planning</span><span>Next: operator diagnostics</span>
          </div>
        </section>

        <section className="platform-cta" aria-labelledby="platform-cta-title">
          <p className="platform-overline">See the work</p>
          <h2 id="platform-cta-title">Build intelligence people can inspect.</h2>
          <div>
            <a className="platform-action" href={PRODUCT_URL}>Open Nexus ↗</a>
            <a className="platform-link" href={`${LANDING_URL}/#top`}>Return to the story</a>
          </div>
        </section>
      </main>
      <footer className="platform-footer"><span>Nexus by OpenZentra</span><a href="/">Home</a></footer>
    </div>
  );
};
