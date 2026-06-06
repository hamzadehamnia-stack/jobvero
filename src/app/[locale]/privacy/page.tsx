import { promises as fs } from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const metadata = {
  title: 'Privacy Policy — Jobvero',
  description: 'Privacy Policy of Jobvero by MELNZ LLC',
};

export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'src/content/legal/privacy-policy.md');
  const content = await fs.readFile(filePath, 'utf-8');

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-h1:text-4xl prose-h1:font-bold prose-h2:text-2xl prose-h2:mt-12 prose-a:text-violet-600 dark:prose-a:text-violet-400 prose-table:text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  );
}
