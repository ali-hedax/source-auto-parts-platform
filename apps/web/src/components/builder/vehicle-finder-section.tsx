import type { BuilderBlock, FinderGroupView } from '@hedax/contracts';
import { localize } from '@hedax/contracts/constants';
import { VehicleFinderSteps } from '@/components/catalog/vehicle-finder-steps';
import './vehicle-finder.css';

/**
 * «انتخاب خودرو» section (Appearance): a full-width band with the four-step vehicle finder. Only the
 * groups come with the page (builder data); vehicles, models and years are fetched as the visitor chooses.
 */
export function VehicleFinderSection({ block: b, groups, locale }: { block: BuilderBlock; groups: FinderGroupView[]; locale: string }) {
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const fa = locale === 'fa';
  const title = L(b.title) || (fa ? 'قطعهٔ مناسب خودروی خود را پیدا کنید' : 'Find parts for your vehicle');
  const body = L(b.body);
  return <section id="vehicle-finder" className="vf-band" aria-labelledby={`${b.id}-vf-title`}>
    <div className="vf-inner">
      <div className="vf-head">
        <h2 id={`${b.id}-vf-title`} className="vf-title">{title}</h2>
        {body ? <p className="vf-body">{body}</p> : null}
      </div>
      {groups.length
        ? <VehicleFinderSteps groups={groups} locale={fa ? 'fa' : 'en'} buttonLabel={L(b.button) || (fa ? 'نمایش قطعات خودرو' : 'Show parts for this vehicle')} requestHref={`/${locale}${b.href || '/request-part'}`} />
        : <p className="vf-hint" role="status">{fa ? 'فهرست خودروها در حال حاضر در دسترس نیست.' : 'The vehicle list is not available right now.'}</p>}
    </div>
  </section>;
}
