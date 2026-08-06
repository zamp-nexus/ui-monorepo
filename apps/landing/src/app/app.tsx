import { ArchitectureMap } from './components/architecture-map';
import { ExecutionVisual } from './components/execution-visual';
import { OperationsTrace } from './components/operations-trace';
import { PlatformStory } from './components/platform-story';
import { ProductLogo } from './components/product-mark';
import { Reveal } from './components/reveal';
import { SiteHeader } from './components/site-header';
import { PRODUCT_URL, TRUST_PRINCIPLES } from './constants';

export function App() {
  return (
    <div className="landing-shell">
      <SiteHeader />
      <main>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero__mesh" aria-hidden="true" />
          <div className="hero__signal" aria-hidden="true" />
          <div className="hero__content">
            <Reveal className="hero__copy">
              <p className="eyebrow"><span /> AI-native analytical infrastructure</p>
              <h1 id="hero-title">The governed runtime for analytical agents.</h1>
              <p className="hero__lede">
                Run analytical agents across your data with semantics, evaluation, human approval,
                and replay built into every answer.
              </p>
              <div className="hero__actions">
                <a
                  className="primary-link primary-link--large"
                  href={PRODUCT_URL}
                  data-testid="hero-product-link"
                >
                  Open Nexus <span aria-hidden="true">↗</span>
                </a>
                <a className="secondary-link" href="#trust-loop">
                  See how trust works <span aria-hidden="true">↓</span>
                </a>
              </div>
              <dl className="hero__proof" aria-label="Nexus governance capabilities">
                <div><dt>01</dt><dd>Governed semantics</dd></div>
                <div><dt>02</dt><dd>Independent evaluation</dd></div>
                <div><dt>03</dt><dd>Human approval</dd></div>
              </dl>
            </Reveal>
            <Reveal className="hero__visual" delay={0.12}>
              <ExecutionVisual />
            </Reveal>
          </div>
          <div className="hero__scroll" aria-hidden="true"><span /> Scroll to inspect</div>
        </section>

        <section className="thesis section" aria-labelledby="thesis-title">
          <Reveal className="section-heading section-heading--wide">
            <p className="eyebrow">The operating principle</p>
            <h2 id="thesis-title">Intelligence is cheap. Trust is architecture.</h2>
            <p>
              Nexus treats every analytical answer as a system of claims, checks, decisions, and
              evidence—not a persuasive block of generated text.
            </p>
          </Reveal>
          <div className="principles">
            {TRUST_PRINCIPLES.map(([index, title, description], position) => (
              <Reveal className="principle" delay={position * 0.06} key={index}>
                <span>{index}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="trust-loop section" id="trust-loop" aria-labelledby="trust-loop-title">
          <div className="section-kicker">01 · Trust loop</div>
          <Reveal className="section-heading">
            <h2 id="trust-loop-title">From source to decision, nothing disappears.</h2>
            <p>One continuous control plane follows the work without hiding the disagreement.</p>
          </Reveal>
          <PlatformStory />
        </section>

        <section
          className="architecture section"
          id="architecture"
          aria-labelledby="architecture-heading"
        >
          <div className="section-kicker">02 · Architecture</div>
          <Reveal className="section-heading section-heading--split">
            <h2 id="architecture-heading">A runtime built around the answer.</h2>
            <p>
              The agent is one participant. Semantics constrain it, evaluators challenge it, policy
              gates it, and replay preserves the path.
            </p>
          </Reveal>
          <Reveal>
            <ArchitectureMap />
          </Reveal>
        </section>

        <section
          className="operations section"
          id="operations"
          aria-labelledby="operations-heading"
        >
          <div className="section-kicker">03 · Operations</div>
          <div className="operations__layout">
            <Reveal className="section-heading">
              <h2 id="operations-heading">Operate agents like infrastructure.</h2>
              <p>
                See model choice, latency, cost, evidence, retries, approvals, and terminal state in
                one safe execution record.
              </p>
              <ul className="operations__notes">
                <li>
                  <span>01</span> Prompts and raw customer rows stay out of the audit ledger.
                </li>
                <li>
                  <span>02</span> Every model call remains attributable to a role and run.
                </li>
                <li>
                  <span>03</span> Replay shows public process truth, not hidden reasoning.
                </li>
              </ul>
            </Reveal>
            <Reveal delay={0.12}>
              <OperationsTrace />
            </Reveal>
          </div>
        </section>

        <section className="security section" id="security" aria-labelledby="security-heading">
          <div className="section-kicker">04 · Enterprise trust</div>
          <Reveal className="section-heading section-heading--wide">
            <h2 id="security-heading">Control is part of the execution.</h2>
          </Reveal>
          <div className="security__list">
            {[
              [
                'Tenant isolation',
                'Identity and source scope resolve before analytical work begins.',
              ],
              [
                'Governed access',
                'Agents act only through approved tools, semantics, and policies.',
              ],
              [
                'Human gates',
                'Low confidence and organizational policy stop publication explicitly.',
              ],
              [
                'Redacted audit',
                'Replay preserves process metadata without copying raw result rows.',
              ],
            ].map(([title, description]) => (
              <div className="security__item" key={title}>
                <span className="security__check" aria-hidden="true">
                  ✓
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-cta-heading">
          <div className="final-cta__grid" aria-hidden="true" />
          <Reveal className="final-cta__content">
            <ProductLogo className="final-cta__mark" />
            <p className="eyebrow">Nexus · Governed analytical infrastructure</p>
            <h2 id="final-cta-heading">Build intelligence people can verify.</h2>
            <a
              className="primary-link primary-link--large"
              href={PRODUCT_URL}
              data-testid="final-product-link"
            >
              Open Nexus <span aria-hidden="true">↗</span>
            </a>
          </Reveal>
        </section>
      </main>
      <footer className="site-footer">
        <span>Nexus by OpenZentra</span>
        <span>Forensic analytics, governed by evidence.</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}

export default App;
