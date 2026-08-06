import { useState } from 'react';

import { m } from 'motion/react';

import { STORY_STEPS } from '../constants';

export const PlatformStory = () => {
  const [activeStep, setActiveStep] = useState(0);
  const active = STORY_STEPS[activeStep];

  return (
    <div className="platform-story">
      <div className="platform-story__steps">
        {STORY_STEPS.map((step, index) => (
          <m.article
            className="story-step"
            key={step.index}
            onViewportEnter={() => setActiveStep(index)}
            viewport={{ margin: '-38% 0px -38% 0px' }}
          >
            <div className="story-step__meta">
              <span>{step.index}</span>
              <span>{step.stage}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </m.article>
        ))}
      </div>
      <aside className="platform-story__sticky" aria-live="polite">
        <div className="story-monitor">
          <div className="story-monitor__header">
            <span>Trust loop</span>
            <span>{active.index} / 05</span>
          </div>
          <div className="story-monitor__field" aria-hidden="true">
            <div className="story-monitor__orbit story-monitor__orbit--outer" />
            <div className="story-monitor__orbit story-monitor__orbit--inner" />
            <m.div
              className="story-monitor__signal"
              animate={{ rotate: activeStep * 72 }}
              transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
            >
              <span />
            </m.div>
            <div className="story-monitor__core">
              <span>{active.stage}</span>
              <strong>{active.index}</strong>
            </div>
          </div>
          <div className="story-monitor__result">
            <span>Current signal</span>
            <strong>{active.signal}</strong>
          </div>
        </div>
      </aside>
    </div>
  );
};
