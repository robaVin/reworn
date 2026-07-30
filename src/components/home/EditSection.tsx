import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import {
  ListingGrid,
  ListingGridEmpty,
} from '@/components/marketplace/ListingGrid';
import {
  listPublishedListings,
  listBrowseCategories,
} from '@/modules/catalog/public-catalog';
import { parseBrowseQuery } from '@/modules/catalog/browse-query';
import {
  publicCardToListingCard,
  productHref,
} from '@/components/marketplace/listing-card-data';

/** How many real listings the homepage previews (bounded). */
const HOME_LISTING_COUNT = 8;

/**
 * "The edit" — the homepage discovery section, backed by REAL published
 * listings (newest first) and REAL active categories. No sample inventory: an
 * honest empty state renders when nothing is published yet. Cover URLs for the
 * whole preview are batch-signed in one request by the service.
 */
export async function EditSection() {
  const [page, categories] = await Promise.all([
    listPublishedListings({
      ...parseBrowseQuery({}),
      pageSize: HOME_LISTING_COUNT,
    }),
    listBrowseCategories(),
  ]);
  const cards = page.items.map(publicCardToListingCard);

  return (
    <section
      id="edit"
      aria-labelledby="edit-heading"
      className="mx-auto max-w-shell px-4 sm:px-8 lg:px-10"
    >
      <div className="mb-1 mt-12 flex flex-wrap items-baseline justify-between gap-3.5">
        <h2
          id="edit-heading"
          className="font-display text-2xl font-bold text-ink sm:text-[34px]"
        >
          The edit
        </h2>
        <Button href="/browse" variant="ghost" size="sm">
          See all
        </Button>
      </div>

      <nav aria-label="Categories" className="my-5 flex flex-wrap gap-2">
        <Chip href="/browse" selected>
          All
        </Chip>
        {categories.map((category) => (
          <Chip key={category.slug} href={`/browse?category=${category.slug}`}>
            {category.name}
          </Chip>
        ))}
      </nav>

      {cards.length === 0 ? (
        <ListingGridEmpty
          title="No listings yet"
          action={<Button href="/sell">List an item</Button>}
        >
          Nothing has been published yet — freshly listed pieces will appear
          here first.
        </ListingGridEmpty>
      ) : (
        <ListingGrid listings={cards} hrefFor={productHref} />
      )}
    </section>
  );
}
