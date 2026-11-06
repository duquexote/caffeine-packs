export type ItemType =
  | 'pote' | 'togo' | 'sache'
  | 'leque' | 'saches' | 'caneca' | 'mixer' | 'copo' | 'bolsa' | 'chapeu'
  /** tipo antigo (uploads feitos antes da separação em bolsa/chapeu) */
  | 'acessorio'
  | 'outro';

/** Como os produtos são montados (ver layout.ts). */
export interface PackLayout {
  /**
   * onde fica a lata da frente: 'esquerda' (banners de campanha), 'direita' (junto dos brindes) ou
   * 'centro' (triângulo: a do meio na frente, as outras atrás dos dois lados; produtos menores na frente)
   */
  depth: 'esquerda' | 'direita' | 'centro';
  /** fileiras de produtos; 'auto' usa 2 a partir de 6 produtos */
  rows: 'auto' | 1 | 2;
}

export type Rect4 = [number, number, number, number];

/** Item do catálogo. Posicionado pelo "quadro" (a caixa da instância no Figma). */
export interface Asset {
  id: string;
  nodeId?: string;
  line: string;
  kind: 'produto' | 'brinde';
  type: ItemType;
  props: Record<string, string>;
  label: string;
  src: string;
  thumb: string;
  /** largura/altura do quadro */
  aspect: number;
  /** área da imagem (recortada) dentro do quadro, normalizada 0..1: x0,y0,x1,y1 */
  crop: Rect4;
  /** área visível (pixels não transparentes) dentro do quadro, normalizada */
  bbox: Rect4;
  custom?: boolean;
}

export interface PackItem {
  uid: string;
  assetId: string;
}

/** Ajuste manual de um item, em unidades de referência (antes do enquadramento no formato). */
export interface ItemAdjust {
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  flip: boolean;
  /** deslocamento na ordem de camadas (positivo = para frente) */
  z: number;
}

/** Ajuste da composição inteira em um formato (zoom e deslocamento em fração do quadro). */
export interface FormatAdjust {
  zoom: number;
  dx: number;
  dy: number;
}

export interface Pack {
  id: string;
  name: string;
  items: PackItem[];
  adjust: Record<string, ItemAdjust>;
  formatAdjust: Record<string, FormatAdjust>;
  /** opcional para manter compatibilidade com packs salvos antes */
  layout?: PackLayout;
  updatedAt: number;
  /** updatedAt da versão salva de que este rascunho partiu (para avisar se alguém do time salvou outra depois) */
  savedAt?: number;
}

export interface Format {
  id: string;
  label: string;
  width: number;
  height: number;
  /** sufixo do arquivo exportado, ex.: "-PRM" */
  suffix: string;
  /** margens para o enquadramento automático, em fração do quadro */
  margin: { x: number; top: number; bottom: number };
}

/** Item posicionado no quadro do formato (unidades do frame, ex.: 360x180). */
export interface Placement {
  uid: string;
  asset: Asset;
  /** caixa do quadro do asset */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flip: boolean;
  z: number;
}
