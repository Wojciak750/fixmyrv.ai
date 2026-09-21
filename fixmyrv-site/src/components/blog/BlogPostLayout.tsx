import { Link } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EmailCapture from "@/components/EmailCapture";
import {
  type BlogPost,
  getRelatedPosts,
  formatPublishDate,
} from "@/data/blogPosts";


interface BlogPostLayoutProps {
  post: BlogPost;
  children: React.ReactNode;
  /** Optional schema.org author node. Defaults to the FixMyRV.ai Organization. */
  author?: Record<string, unknown>;
  /** Extra JSON-LD nodes for the page (FAQPage, HowTo, Person, and so on). */
  extraJsonLd?: Record<string, unknown>[];
  /** Set true when the post body carries its own closing call to action. */
  hideDefaultCta?: boolean;
}

const SITE = "https://fixmyrv.ai";
const DEFAULT_OG = `${SITE}/__l5e/assets-v1/a93c60c0-a4e0-4f3e-aab8-314573935448/fixmyrv-og-card-v4.jpg`;

const BlogPostLayout = ({ post, children, author, extraJsonLd = [], hideDefaultCta = false }: BlogPostLayoutProps) => {
  const canonical = `${SITE}/blog/${post.slug}`;
  const ogImage = post.image || DEFAULT_OG;
  const related = post.relatedSlugs?.length ? getRelatedPosts(post.relatedSlugs) : [];

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    image: ogImage,
    datePublished: post.publishDate,
    dateModified: post.lastUpdated,
    author: author ?? { "@type": "Organization", name: "FixMyRV.ai" },
    publisher: {
      "@type": "Organization",
      name: "FixMyRV.ai",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: post.category, item: `${SITE}/blog` },
      { "@type": "ListItem", position: 4, name: post.title, item: canonical },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEOHead
        title={post.metaTitle}
        description={post.metaDescription}
        canonical={canonical}
        ogType="article"
        ogImage={ogImage}
        jsonLd={[articleSchema, breadcrumbSchema, ...extraJsonLd]}
        noindex={false}
      />
      <Navbar />

      <main className="flex-1">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="max-w-3xl mx-auto px-4 pt-8 text-sm text-gray-500">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li><Link to="/" className="hover:text-rv-blue">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/blog" className="hover:text-rv-blue">Blog</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/blog" className="hover:text-rv-blue">{post.category}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-gray-700 truncate max-w-[50ch]" aria-current="page">{post.title}</li>
          </ol>
        </nav>

        {/* Article */}
        <article className="max-w-3xl mx-auto px-4 py-12">
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-rv-gray-dark leading-tight">
              {post.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-gray-600">
              <span className="inline-flex items-center rounded-full bg-rv-blue/10 text-rv-blue px-3 py-1 text-xs font-medium">
                {post.category}
              </span>
              <span>Published {formatPublishDate(post.publishDate)}</span>
              <span aria-hidden="true">·</span>
              <span>{post.readTime}</span>
            </div>
          </header>

          <div className="prose prose-lg max-w-none prose-headings:text-rv-gray-dark prose-a:text-rv-blue prose-strong:text-rv-gray-dark">
            {children}
          </div>

          {/* Bottom CTA */}
          {!hideDefaultCta && (
            <aside className="bg-rv-blue/10 rounded-2xl p-8 my-12 text-center">
              <h3 className="text-2xl font-bold mb-3" style={{ color: "#1E4785" }}>
                Need Help With This Issue Right Now?
              </h3>
              <p className="mt-3 text-gray-700">
                Our diagnostic service is backed by over 50,000 pages of professional repair manuals curated by experienced RV technicians. Text us your specific situation and we will walk you through it step by step. One issue, 48 hours of unlimited help, no subscription.
              </p>
              <Link
                to="/fix"
                className="inline-flex items-center justify-center mt-6 bg-rv-blue hover:bg-rv-blue/90 text-white font-medium px-6 py-3 rounded-lg transition-colors"
              >
                Get Help Now · $49
              </Link>
            </aside>
          )}
        </article>

        {/* Related Posts */}
        {related.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 pb-12">
            <h3 className="text-2xl font-bold text-rv-gray-dark mb-6">
              Related Troubleshooting Guides
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((rp) => (
                <article
                  key={rp.slug}
                  className="bg-white rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow"
                >
                  <span className="inline-flex items-center rounded-full bg-rv-blue/10 text-rv-blue px-3 py-1 text-xs font-medium">
                    {rp.category}
                  </span>
                  <h4 className="mt-3 text-lg font-semibold text-rv-gray-dark leading-snug">
                    <Link to={`/blog/${rp.slug}`} className="hover:text-rv-blue">
                      {rp.title}
                    </Link>
                  </h4>
                  <p className="mt-2 text-sm text-gray-600 line-clamp-2">{rp.excerpt}</p>
                  <p className="mt-3 text-xs text-gray-500">{rp.readTime}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Email capture */}
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <EmailCapture variant="band" />
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default BlogPostLayout;
