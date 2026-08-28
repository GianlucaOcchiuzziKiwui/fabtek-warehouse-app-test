import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { PdfDocument, PdfLine } from "./contracts.ts";

const colors = {
  navy: "#0b2545",
  ochre: "#b8752b",
  lightGray: "#f2f2f2",
};

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingHorizontal: 34, paddingBottom: 48, fontFamily: "IBM Plex Sans", fontSize: 8, color: colors.navy },
  header: { borderBottomWidth: 2, borderBottomColor: colors.ochre, paddingBottom: 10, marginBottom: 14 },
  brand: { fontSize: 18, fontWeight: 600, color: colors.navy },
  title: { marginTop: 4, fontSize: 12, fontWeight: 600, color: colors.ochre },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 9, fontWeight: 600, color: colors.ochre, marginBottom: 5 },
  requestGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.lightGray },
  requestCell: { width: "50%", padding: 5, borderBottomWidth: 1, borderBottomColor: colors.lightGray },
  requestLabel: { color: colors.ochre, fontSize: 7, marginBottom: 1 },
  table: { borderWidth: 1, borderColor: colors.lightGray },
  tableHeader: { flexDirection: "row", backgroundColor: colors.navy, color: colors.lightGray, fontWeight: 600 },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.lightGray },
  cell: { padding: 4, borderRightWidth: 1, borderRightColor: colors.lightGray },
  compactCell: { padding: 3, borderRightWidth: 1, borderRightColor: colors.lightGray },
  code: { width: "13%" },
  description: { width: "34%" },
  details: { width: "31%" },
  quantity: { width: "22%", borderRightWidth: 0 },
  finalCode: { width: "12%" },
  finalDescription: { width: "28%" },
  finalDetails: { width: "25%" },
  finalQuantity: { width: "11.5%" },
  finalLastQuantity: { width: "12%", borderRightWidth: 0 },
  history: { padding: 4, paddingLeft: 8, backgroundColor: colors.lightGray, borderTopWidth: 1, borderTopColor: colors.lightGray },
  warning: { borderWidth: 1, borderColor: colors.ochre, padding: 7, color: colors.ochre, marginTop: 2 },
  footer: { position: "absolute", left: 34, right: 34, bottom: 20, flexDirection: "row", justifyContent: "space-between", color: colors.ochre, fontSize: 7 },
});

function PdfHeader({ title }: { title: string }) {
  return <View style={styles.header}><Text style={styles.brand}>FABTEK</Text><Text style={styles.title}>{title}</Text></View>;
}

function RequestData({ document }: { document: PdfDocument }) {
  const fields = [
    ["Richiedente", document.requesterName],
    ["Data", document.documentDateLabel],
    ["Progetto", document.project],
    ["Linea utensile", document.toolLine],
    ["Utilities", document.utilities],
    ["Note", document.notes ?? "—"],
  ];
  if (document.kind !== "draft") fields.push(["Stato", document.statusLabel]);

  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>Dati richiesta</Text>
    <View style={styles.requestGrid}>{fields.map(([label, value]) => <View key={label} style={styles.requestCell}><Text style={styles.requestLabel}>{label}</Text><Text>{value}</Text></View>)}</View>
  </View>;
}

function lineDescription(line: PdfLine) {
  return `${line.categoryName} · ${line.familyName} · ${line.componentName}\n${line.description}`;
}

function lineDetails(line: PdfLine) {
  return [line.oracleSapioCode && `Oracle/Sapio: ${line.oracleSapioCode}`, line.diameter && `Diametro: ${line.diameter}`, `Materiale: ${line.material}`, `Connessione: ${line.connection}`].filter(Boolean).join("\n");
}

function InitialLine({ line }: { line: PdfLine }) {
  return <View style={styles.tableRow} wrap={false}>
    <Text style={[styles.cell, styles.code]}>{line.fabtekCode}</Text>
    <Text style={[styles.cell, styles.description]}>{lineDescription(line)}</Text>
    <Text style={[styles.cell, styles.details]}>{lineDetails(line)}</Text>
    <Text style={[styles.cell, styles.quantity]}>{line.requestedQuantity} {line.unitOfMeasure}</Text>
  </View>;
}

function HistoryEntry({ line, fulfillment, isFirst }: { line: PdfLine; fulfillment: NonNullable<PdfLine["fulfillments"]>[number]; isFirst: boolean }) {
  return <View style={styles.history}>
    <Text>{isFirst ? "Storico: " : ""}{fulfillment.fulfilledAtLabel}: {fulfillment.quantity} {line.unitOfMeasure}{fulfillment.notes ? ` — ${fulfillment.notes}` : ""}</Text>
  </View>;
}

function FinalLine({ line }: { line: PdfLine }) {
  const fulfillments = line.fulfillments ?? [];
  return <>
    <View wrap={false}>
    <View style={styles.tableRow} wrap={false}>
      <Text style={[styles.compactCell, styles.finalCode]}>{line.fabtekCode}</Text>
      <Text style={[styles.compactCell, styles.finalDescription]}>{lineDescription(line)}</Text>
      <Text style={[styles.compactCell, styles.finalDetails]}>{lineDetails(line)}</Text>
      <Text style={[styles.compactCell, styles.finalQuantity]}>{line.requestedQuantity} {line.unitOfMeasure}</Text>
      <Text style={[styles.compactCell, styles.finalQuantity]}>{line.fulfilledQuantity ?? 0} {line.unitOfMeasure}</Text>
      <Text style={[styles.compactCell, styles.finalLastQuantity]}>{line.remainingQuantity ?? line.requestedQuantity} {line.unitOfMeasure}</Text>
    </View>
      {fulfillments[0] ? <HistoryEntry line={line} fulfillment={fulfillments[0]} isFirst /> : <View style={styles.history}><Text>Storico: Nessuna evasione registrata</Text></View>}
    </View>
    {fulfillments.slice(1).map((fulfillment, index) => <HistoryEntry key={`${fulfillment.fulfilledAtLabel}-${index + 1}`} line={line} fulfillment={fulfillment} isFirst={false} />)}
  </>;
}

function MaterialTable({ document }: { document: PdfDocument }) {
  const isFinalReport = document.kind === "final_report";
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>Materiali richiesti</Text>
    <View style={styles.table}>
      {isFinalReport ? <View style={styles.tableHeader} fixed>
        <Text style={[styles.compactCell, styles.finalCode]}>Codice</Text><Text style={[styles.compactCell, styles.finalDescription]}>Materiale</Text><Text style={[styles.compactCell, styles.finalDetails]}>Dettagli</Text><Text style={[styles.compactCell, styles.finalQuantity]}>Rich.</Text><Text style={[styles.compactCell, styles.finalQuantity]}>Evasa</Text><Text style={[styles.compactCell, styles.finalLastQuantity]}>Residua</Text>
      </View> : <View style={styles.tableHeader} fixed>
        <Text style={[styles.cell, styles.code]}>Codice</Text><Text style={[styles.cell, styles.description]}>Materiale</Text><Text style={[styles.cell, styles.details]}>Dettagli</Text><Text style={[styles.cell, styles.quantity]}>Quantità</Text>
      </View>}
      {document.lines.map((line, index) => isFinalReport ? <FinalLine key={`${line.fabtekCode}-${index}`} line={line} /> : <InitialLine key={`${line.fabtekCode}-${index}`} line={line} />)}
    </View>
  </View>;
}

function DraftWarning() {
  return <Text style={styles.warning}>Documento provvisorio: la richiesta non è stata ancora inviata.</Text>;
}

function PdfFooter() {
  return <View style={styles.footer} fixed><Text>Fabtek · Gestione materiali</Text><Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} /></View>;
}

export function FabtekPdf({ document }: { document: PdfDocument }) {
  const title = document.kind === "draft"
    ? "Distinta richiesta materiale — BOZZA"
    : document.kind === "initial_request"
      ? `Richiesta materiale #${document.requestNumber}`
      : `Report finale richiesta #${document.requestNumber}`;

  return <Document title={title} author="Fabtek"><Page size="A4" style={styles.page} wrap>
    <PdfHeader title={title} />
    <RequestData document={document} />
    <MaterialTable document={document} />
    {document.kind === "draft" ? <DraftWarning /> : null}
    <PdfFooter />
  </Page></Document>;
}
