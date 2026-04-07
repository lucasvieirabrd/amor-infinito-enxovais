# Plano de Reformulação UI/UX

## 1. Design System

### Cores
- **Fundo Principal:** `#F8F9FA` (cinza muito claro)
- **Cor Primária:** `#6C63FF` (roxo/violeta)
- **Cor Secundária:** `#FF6584` (rosa/coral) para alertas e destaques
- **Cor de Sucesso:** `#48BB78` (verde)
- **Cor de Erro:** `#FC8181` (vermelho suave)

### Componentes
- **Cards:** Fundo branco, `border-radius: 16px`, `box-shadow: 0 4px 20px rgba(0,0,0,0.08)`

### Tipografia
- **Fonte:** Inter (importar do Google Fonts)
- **Pesos:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

## 2. Layout Geral

- **Sidebar:** Fixa à esquerda, largura de `240px`. Fundo `#6C63FF` com ícones e textos brancos. Item ativo com fundo branco semitransparente.
- **Header Superior:** Fixo, altura `64px`, fundo branco, sombra suave. Exibe: título da página atual, avatar do usuário com inicial, nome do usuário.
- **Conteúdo Principal:** `padding` de `24px`.

## 3. Componentes Core a Criar (em `src/components/ui/`)

- `Sidebar.tsx`
- `Header.tsx`
- `Card.tsx`
- `Badge.tsx`
- `Button.tsx`
- `Input.tsx`
- `Modal.tsx`
- `Table.tsx`
- `Loading.tsx` (skeleton loader)
- `Toast.tsx`

## 4. Estratégia de Implementação

1.  **Configuração Inicial:**
    - Instalar `tailwindcss` e configurar para usar as cores e fontes definidas.
    - Importar a fonte Inter do Google Fonts no `index.css` ou `main.tsx`.
2.  **Criação de Componentes Core:** Desenvolver os componentes listados acima em `src/components/ui/`, garantindo que sigam o design system.
3.  **Implementação do Layout:** Criar `Sidebar.tsx` e `Header.tsx` e integrá-los no `App.tsx` ou no layout principal.
4.  **Reformulação das Telas Existentes:** Iterar sobre cada página (`src/pages/`) e refatorá-las para usar os novos componentes e o design system.
5.  **Funcionalidades Pendentes:** Implementar a importação CSV e a página de configurações, utilizando os novos componentes.
6.  **Testes e Otimização:** Garantir a responsividade e performance em diferentes tamanhos de tela.
7.  **Deploy:** Fazer commit e push das alterações para o GitHub para deploy automático no Railway.

## 5. Responsividade

- **Desktop (>1024px):** Sidebar expandida com ícone + texto.
- **Tablet (768px-1024px):** Sidebar colapsada com apenas ícones.
- **Mobile (<768px):** Sidebar vira menu hambúrguer.
