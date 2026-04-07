import { google } from 'googleapis';
import { AppError } from '../utils/AppError';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export class GoogleSheetsService {
  private auth: any;
  private sheets: any;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

    // Configuração de autenticação via Service Account usando o arquivo JSON
    this.auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * Lê todos os produtos da planilha do Google Sheets.
   * Assume que a primeira linha é o cabeçalho e as colunas são: SKU, Nome, Preço, Quantidade.
   */
  async getProductsFromSheet(range = 'Estoque!A2:D') {
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
        price: row[2] ? parseFloat(row[2].toString().replace(',', '.')) : 0,
        quantity: row[3] ? parseInt(row[3].toString(), 10) : 0,
      }));
    } catch (error: any) {
      console.error('Erro ao ler planilha do Google Sheets:', error.message);
      throw new AppError('Falha na integração com Google Sheets', 502);
    }
  }

  /**
   * Atualiza a quantidade de um produto na planilha com base no SKU.
   */
  async updateStockInSheet(sku: string, newQuantity: number) {
    try {
      // Primeiro, localizamos a linha do SKU
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Estoque!A2:A',
      });

      const rows = response.data.values;
      if (!rows) return;

      const rowIndex = rows.findIndex((row: any[]) => row[0] === sku);
      if (rowIndex === -1) return;

      // Coluna D é a quantidade (índice 3 na planilha de 1-base)
      const actualRow = rowIndex + 2;
      const range = `Estoque!D${actualRow}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newQuantity]],
        },
      });
    } catch (error: any) {
      console.error(`Erro ao atualizar SKU ${sku} no Google Sheets:`, error.message);
    }
  }

  /**
   * Adiciona um novo produto à planilha.
   */
  async addProductToSheet(product: any) {
    try {
      const range = 'Estoque!A2:D';
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[product.sku, product.name, product.price, product.quantity]],
        },
      });
    } catch (error: any) {
      console.error('Erro ao adicionar produto ao Google Sheets:', error.message);
    }
  }
}
