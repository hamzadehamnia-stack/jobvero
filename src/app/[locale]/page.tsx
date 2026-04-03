import Hero from '@/components/home/Hero';
import LogosBar from '@/components/home/LogosBar';
import Features from '@/components/home/Features';
import HowItWorks from '@/components/home/HowItWorks';
import Testimonials from '@/components/home/Testimonials';
import CTA from '@/components/home/CTA';

export default function HomePage({ params: { locale } }: { params: { locale: string } }) {
  return (
    <>
      <Hero locale={locale} />
      <LogosBar />
      <Features />
      <HowItWorks />
      <Testimonials />
      <CTA locale={locale} />
    </>
  );
}
