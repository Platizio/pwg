/**
 * The people behind Platizio Global.
 *
 * Moved out of the old TeamCarousel so the data outlives the component that
 * happened to render it first.
 */

export interface TeamMember {
  name: string
  role: string
  image: string
}

/**
 * The order is Aayush's, given by name, and it is deliberately not
 * alphabetical — so no tidying pass should "fix" it back into sort order.
 * The carousel renders this array exactly as written.
 */
export const TEAM: readonly TeamMember[] = [
  { name: 'Aanyaa Bhardwaj', role: 'Social Media Executive', image: '/team/aanyaa-bhardwaj.jpg' },
  { name: 'Vinayak Tyagi', role: 'Product Software Developer', image: '/team/vinayak-tyagi.jpg' },
  { name: 'Aayush Sharma', role: 'Product Software Developer', image: '/team/aayush-sharma.jpg' },
  { name: 'Deepika Agarwal', role: 'Financial Market Analyst', image: '/team/deepika-agarwal.jpg' },
  { name: 'Kavya Khatri', role: 'Social Media Executive', image: '/team/kavya-khatri.jpg' },
  { name: 'Anuj Pal', role: 'Senior Financial Market Analyst', image: '/team/anuj-pal.jpg' },
  { name: 'Kartik Vishnani', role: 'Financial Market Analyst', image: '/team/kartik-vishnani.jpg' },
  { name: 'Sumit Katyal', role: 'Product Software Developer', image: '/team/sumit-katyal.jpg' },
]

/**
 * "Anuj Pal" -> "AP". Falls back to a star for a name with no Latin letters,
 * so the tile is never blank.
 */
export function initials(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('') || '★'
  )
}
