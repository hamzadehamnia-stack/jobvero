import Link from 'next/link';
import Button from '@/components/ui/Button';

export default function NotFound() {
  return (
    <section className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="text-center max-w-md">
        <p className="text-8xl font-extrabold gradient-text mb-4">404</p>
        <h1 className="text-2xl font-bold text-white mb-3">Page not found</h1>
        <p className="text-gray-400 text-sm mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/">
          <Button size="lg">Go back home</Button>
        </Link>
      </div>
    </section>
  );
}
