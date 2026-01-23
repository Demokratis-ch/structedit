/**
 * Docling API response types
 */
export interface DoclingConvertResponse {
  document: {
    md_content?: string;
    html_content?: string;
    export_status?: string;
  }[];
}
