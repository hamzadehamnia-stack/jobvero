'use client';
import { useEffect } from 'react';

/**
 * Mounts once and wires IntersectionObserver to every .reveal-on-scroll
 * element on the page. Adds `.is-visible` when they enter the viewport,
 * triggering the CSS transition defined in globals.css.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<Element>('.reveal-on-scroll');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -48px 0px' }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
