/**
 * Real AI Canton Document Fixtures
 * Based on actual Revision Personalverordnung.md structure
 * These simulate what Docling HTML output should look like
 */

/**
 * Simulated HTML output from Docling for Revision Personalverordnung
 * (approximated from the markdown structure we have)
 */
export const REVISION_PERSONALVERORDNUNG_HTML = `
<h1>Arbeitsversion Revision Personalverordnung (PeV)</h1>
<p>Kanton Appenzell Innerrhoden 172.310-2025</p>
<p>Änderung vom [Datum]</p>
<p>Von diesem Geschäft tangierte Erlasse (GS Nummern)</p>
<p>Neu: –</p>
<p>Geändert: 172.310</p>
<p>Aufgehoben: –</p>
<p>Der Grosse Rat,</p>
<p>gestützt auf Art. 24 des Staatsorganisationsgesetzes (SOG) vom ...,</p>
<p>beschliesst:</p>
<p>I. Änderung Personalverordnung (PeV) vom 30. November 1998:</p>
<p>Art. 1 Abs. 2 (geändert)</p>
<p>2 Die Personalregelungen für die Mitarbeitenden des Kantons gelten sinngemäss auch für die Bezirke und die Gemeinden, sofern diese für sich keine abweichende Regelung haben oder für sie nicht anderweitige kantonale Regelungen bestehen.</p>
<p>Art. 2 Abs. 1 (geändert), Abs. 2 (aufgehoben)</p>
<p>Ergänzendes Recht (Überschrift geändert)</p>
<p>1 Soweit das kantonale Recht nichts anderes regelt, gelten die Bestimmungen des Schweizerischen Obligationenrechts sinngemäss.</p>
<p>2 Aufgehoben.</p>
<p>Art. 3 Abs. 1 (geändert)</p>
<p>1 Soweit das kantonale Recht nichts anderes regelt, liegen die Aufgaben, Kompetenzen und Verantwortungen im Personalbereich bei der Standeskommission.</p>
<p>Art. 7a</p>
<p>Aufgehoben.</p>
<p>Art. 23a (neu)</p>
<p>Unvereinbarkeit</p>
<p>1 Mitarbeitende der kantonalen Verwaltung dürfen nicht dem Grossen Rat oder einem Gericht angehören, wenn:</p>
<p>a. sie als Ratschreiber oder Departementssekretär tätig sind;</p>
<p>b. sie ein Amt oder eine Dienststelle leiten;</p>
<p>c. ihre Stelle mindestens der Funktionsstufe 10 zugewiesen ist.</p>
<p>2 Für Mitarbeitende der unselbständigen kantonalen Anstalten gilt die Regelung nach Abs. 1 sinngemäss.</p>
<p>Art. 26 Abs. 1 (aufgehoben), Abs. 2 (aufgehoben)</p>
<p>Strafrechtliche Verantwortlichkeit (Überschrift geändert)</p>
<p>1 Aufgehoben.</p>
<p>2 Aufgehoben.</p>
<p>II.</p>
<p>Keine Fremdänderungen.</p>
<p>III.</p>
<p>Keine Fremdaufhebungen.</p>
<p>IV.</p>
<p>Dieser Beschluss tritt am ... in Kraft.</p>
`;

/**
 * Expected block types after legal pattern detection
 */
export const EXPECTED_BLOCK_TYPES = [
  { content_starts: 'Arbeitsversion', type: 'h1' },  // Kept as h1 from HTML
  { content_starts: 'Kanton', type: 'p' },
  { content_starts: 'Änderung vom', type: 'p' },
  { content_starts: 'Von diesem', type: 'p' },
  { content_starts: 'Neu:', type: 'p' },
  { content_starts: 'Geändert:', type: 'p' },
  { content_starts: 'Aufgehoben:', type: 'p' },
  { content_starts: 'Der Grosse', type: 'p' },
  { content_starts: 'gestützt auf', type: 'p' },
  { content_starts: 'beschliesst', type: 'p' },
  { content_starts: 'I. Änderung', type: 'h2' },     // Roman numeral section
  { content_starts: 'Art. 1 Abs.', type: 'h3' },     // Article heading
  { content_starts: '2 Die Personal', type: 'p' },  // Numbered paragraph
  { content_starts: 'Art. 2 Abs.', type: 'h3' },     // Article heading
  { content_starts: 'Ergänzendes', type: 'p' },
  { content_starts: '1 Soweit', type: 'p' },
  { content_starts: '2 Aufgehoben', type: 'p' },
  { content_starts: 'Art. 3 Abs.', type: 'h3' },     // Article heading
  { content_starts: '1 Soweit das', type: 'p' },
  { content_starts: 'Art. 7a', type: 'h3' },         // Article heading
  { content_starts: 'Aufgehoben.', type: 'p' },
  { content_starts: 'Art. 23a (neu)', type: 'h3' },  // Article heading with marker
  { content_starts: 'Unvereinbarkeit', type: 'p' },
  { content_starts: '1 Mitarbeitende', type: 'p' },
  { content_starts: 'a. sie als', type: 'abc' },     // Lettered list item
  { content_starts: 'b. sie ein', type: 'abc' },     // Lettered list item
  { content_starts: 'c. ihre Stelle', type: 'abc' }, // Lettered list item
  { content_starts: '2 Für Mitarbeitende', type: 'p' },
  { content_starts: 'Art. 26 Abs.', type: 'h3' },    // Article heading
  { content_starts: 'Strafrechtliche', type: 'p' },
  { content_starts: '1 Aufgehoben', type: 'p' },
  { content_starts: '2 Aufgehoben', type: 'p' },
  { content_starts: 'II.', type: 'h2' },             // Roman numeral section
  { content_starts: 'Keine Fremd', type: 'p' },
  { content_starts: 'III.', type: 'h2' },            // Roman numeral section
  { content_starts: 'Keine Fremdauf', type: 'p' },
  { content_starts: 'IV.', type: 'h2' },             // Roman numeral section
  { content_starts: 'Dieser Beschluss', type: 'p' },
];
