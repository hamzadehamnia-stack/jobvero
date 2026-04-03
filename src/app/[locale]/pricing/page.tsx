import PricingTable from '@/components/pricing/PricingTable';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  return { title: t('headline') };
}

export default function PricingPage() {
  return (
    <section className="pt-24 pb-20 px-4">
      <PricingTable />
    </section>
  );
}
