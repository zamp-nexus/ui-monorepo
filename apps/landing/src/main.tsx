import { StrictMode } from 'react';

import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import * as ReactDOM from 'react-dom/client';

import App from './app/app';

import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <App />
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
);
