/* Tests: Foto-OCR-Parser, Barcode-Inhalte, ICD-10-Regelwerk */
const P = require('../lib/ocr-parser');
const R = require('../lib/rules');
let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('ok   ' + name); } else { fail++; console.log('FAIL ' + name); } };

const text = `Muster 56 Verordnung von Rehabilitationssport
AOK Rheinland/Hamburg
Name, Vorname des Versicherten
Mustermann, Max
geb. am 12.04.1975
Versicherten-Nr. A123456789
2 x pro Woche, 50 Übungseinheiten
von 01.11.2026 bis 30.04.2027
Diagnose (ICD-10): M54.5, M5l.1, I2O.0 G
Ziele: Schmerzreduktion und Belastbarkeit
Datum 20.10.2026 Dr. med. Anna Meier`;
const o = P.parseOcrText(text).felder;
t('OCR: Name', o.name === 'Mustermann, Max');
t('OCR: Geburtsdatum', o.geburtsdatum === '1975-04-12');
t('OCR: Versichertennummer', o.versichertenNr === 'A123456789');
t('OCR: Zeitraum', o.von === '2026-11-01' && o.bis === '2027-04-30');
t('OCR: Frequenz/ÜE', o.frequenzProWoche === 2 && o.uebungseinheiten === 50);
t('OCR: ICD mit Ziffernkorrektur', JSON.stringify(o.icd10) === JSON.stringify(['M54.5', 'M51.1', 'I20.0']));
t('OCR: Kasse/Arzt/Art', /AOK/.test(o.kostentraeger) && /Meier/.test(o.arztName) && o.art === 'rs');
const b = P.parseBarcodeText('Name=Mustermann, Max;Geburtsdatum=19750412;VSNR=A123456789;ICD=M54.5,I25.1;Von=2026-11-01;Bis=2027-04-30');
t('Barcode: Schlüssel=Wert', b.format === 'barcode-kv' && b.felder.geburtsdatum === '1975-04-12' && b.felder.icd10.length === 2);
t('Barcode: unlesbar -> roh', P.parseBarcodeText('%%%###').format === 'barcode-roh');
t('ICD: Format', P.istIcdFormat('M54.5') && !P.istIcdFormat('XX1'));
t('ICD-Regel: Herz bei Rehasport -> Hinweis', R.pruefeIcd(['I25.1'], 'rs', 50).hinweise.length === 1);
t('ICD-Regel: I50 nicht in Herzgruppe', R.pruefeIcd(['I50.1'], 'herzgruppe', 90).hinweise.some((h) => /Herzinsuffizienz/.test(h)));
t('ICD-Regel: ungültiger Code erkannt', R.pruefeIcd(['M54.5', 'XX1'], 'rs', 50).ungueltig[0] === 'XX1');
const v = { formular: 'muster56', art: 'rs', icd10: ['M54.5', 'XX1'], uebungseinheiten: 50, frequenzProWoche: 1 };
t('Prüfung: ungültiger ICD blockiert', R.pruefeVerordnung(v).fehler.some((f) => /Ungültiger ICD-10/.test(f)));
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail ? 1 : 0);
