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
      throw new AppError('GOOGLE_SERVICE_ACCOUNT_JSON nao configurado.', 500);
    }

    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      console.log('Parsed credentials successfully.');
    } catch (parseError: any) {
      console.error('Erro ao fazer JSON.parse:', parseError.message);
      throw new AppError('Erro ao processar credenciais do Google Sheets', 500);
    }

    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    console.log('Google Sheets API client initialized.');
  }

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
      return rows.map((row: any[]) => {
        const priceRaw = row[6] ? row[6].toString().trim() : '0';
        const matchParcel = priceRaw.match(/(\d+)x\s*R\$\s*([\d.,]+)/i);
        const price = matchParcel
          ? parseInt(matchParcel[1]) * parseFloat(matchParcel[2].replace('.', '').replace(',', '.'))
          : parseFloat(priceRaw.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
        const priceDisplay = priceRaw;

        return {
          sku: row[0] || '',
          name: row[1] || '',
          category: row[2] || '',
          description: row[3] || '',
          specifications: row[4] || '',
          imageUrl: row[5] || '',
          price,
          priceDisplay,
          quantity: row[7] ? parseInt(row[7].toString(), 10) : 0,
        };
      });
    } catch (error: any) {
      console.error('Erro ao ler planilha:', error.message);
      throw new AppError('Falha na integracao com Google Sheets', 502);
    }
  }

  async updateStockInSheet(sku: string, newQuantity: number) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Página1!A2:A',
      });
      const rows = response.data.values;
      if (!rows) return;
      const rowIndex = rows.findIndex((row: any[]) => row[0] === sku);
      if (rowIndex === -1) return;
      const actualRow = rowIndex + 2;
      const updateRange = 'Página1!H' + actualRow;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newQuantity]],
        },
      });
    } catch (error: any) {
      console.error('Erro ao atualizar estoque:', error.message);
    }
  }

  async addProductToSheet(product: any) {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Página1!A2:H',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            product.sku,
            product.name,
            product.category || '',
            product.description || '',
            product.specifications || '',
            product.imageUrl || '',
            product.price,
            product.quantity,
          ]],
        },
      });
    } catch (error: any) {
      console.error('Erro ao adicionar produto:', error.message);
    }
  }
}
