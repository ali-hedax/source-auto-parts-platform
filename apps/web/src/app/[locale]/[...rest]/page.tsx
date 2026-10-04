import { notFound } from 'next/navigation';

/** Any unknown address inside a locale renders the localized not-found page. */
export default function CatchAll(): never {
  notFound();
}
