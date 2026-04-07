import { google } from 'googleapis';
import { AppError } from '../utils/AppError';
import dotenv from 'dotenv';
dotenv.config();

export class GoogleSheetsService {
  private auth: any;
  private sheets: any;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!credentialsJson) {
      throw new AppError('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.', 500);
    }

    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      console.log('Parsed credentials successfully.');
    } catch (parseError: any) {
      console.error('Erro ao fazer JSON.parse de GOOGLE_SERVICE_ACCOUNT_JSON:', parseError.message);
      throw new AppError('Erro ao processar credenciais do Google Sheets', 500);
    }

    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    console.log('Google Sheets API client initialized.');
  }

  /**
   * Lê todos os produtos da planilha do Google Sheets.
   * Estrutura da planilha (Página1):
   * A: Código | B: Nome | C: Categoria | D: Descrição | E: Especificações | F: URL da Imagem | G: Preço | H: Quantidade
   */
  async getProductsFromSheet(range = 'Página1!A2:H') {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return [];
      }

      return rows.map((row: any[]) => ({
        sku: row[0] || '',
        name: row[1] || '',
        category: row[2] || '',
        description: row[3] || '',
        specifications: row[4] || '',
        imageUrl: row[5] || '',
        price: row[6]
          ? parseFloat(
              row[6]
                .toString()
                .replace('R$', '')
                .replace(/\./g, '')
                price: row[6]
  ? parseFloat(
      row[6]
        .toString()
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim()
    )
  : 0,
