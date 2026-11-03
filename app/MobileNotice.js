'use client';

import { useState } from 'react';

const REPO_URL = 'https://github.com/Eeman1113/flydome';

export default function MobileNotice({ readmeHtml, onContinue }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = location.origin + location.pathname;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link and open it on a laptop or PC:', url);
    }
  };

  return (
    <main className="handheld">
      <section className="handheld-hero">
        <div className="brand">
          <div className="brand-mark">SB</div>
          <div>
            <div className="brand-name">SKYBOUND</div>
            <div className="brand-sub">HDR PROCEDURAL WORLD · CESSNA 182 SKYLANE</div>
          </div>
        </div>
        <div className="kicker">LAPTOP OR DESKTOP REQUIRED</div>
        <h1 className="hero-title">
          Built for the <em>big screen.</em>
        </h1>
        <p className="intro">
          SKYBOUND streams a full 3D procedural world in real time and is flown with a keyboard and mouse or a game
          controller. It isn&apos;t made for phones or tablets. Open this page on a laptop or PC with Chrome or Edge to
          fly.
        </p>
        <div className="handheld-actions">
          <button className="primary" onClick={copyLink}>
            {copied ? 'LINK COPIED ✓' : 'COPY LINK FOR LATER'}
          </button>
          <a className="button" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            VIEW SOURCE ON GITHUB ↗
          </a>
        </div>
        <ul className="handheld-reqs">
          <li><strong>Device</strong><span>Laptop or desktop computer</span></li>
          <li><strong>Browser</strong><span>Chrome or Edge (desktop)</span></li>
          <li><strong>Controls</strong><span>Keyboard + mouse, or a DualSense controller</span></li>
          <li><strong>Download</strong><span>About 9 MB on first visit</span></li>
        </ul>
      </section>

      <section className="handheld-readme">
        <div className="kicker">OPEN SOURCE</div>
        <article className="prose" dangerouslySetInnerHTML={{ __html: readmeHtml }} />
        <footer className="handheld-foot">
          This site is open source.{' '}
          <a href={`${REPO_URL}/edit/main/README.md`} target="_blank" rel="noopener noreferrer">
            Improve this page
          </a>
          .
          <button className="handheld-continue" onClick={onContinue}>
            Try the simulator anyway
          </button>
        </footer>
      </section>
    </main>
  );
}
