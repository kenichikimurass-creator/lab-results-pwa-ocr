export type ResultStatus = 'draft' | 'image_saved' | 'ocr_done' | 'confirmed' | 'archived';

export type ImageFile = {
  id: string;
  fileName: string;
  dropboxPath: string;
  previewUrl?: string;
};

export type LabResult = {
  id: string;
  itemName: string;
  normalizedName: string;
  value: number;
  unit: string;
  normalMin?: number | null;
  normalMax?: number | null;
  memo?: string;
};

export type Exam = {
  id: string;
  testedAt: string;
  facilityName?: string;
  status: ResultStatus;
  imageFiles: ImageFile[];
  ocrText?: string;
  results: LabResult[];
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  version: number;
  exams: Exam[];
  aliases: Record<string, string[]>;
};

export const defaultData = (): AppData => ({
  version: 1,
  exams: [],
  aliases: {
    'CA19-9': ['CA19-9', 'CA 19-9', 'ＣＡ１９－９', 'CA19‐9'],
    CEA: ['CEA', 'ＣＥＡ'],
    CRP: ['CRP', 'ＣＲＰ'],
    WBC: ['WBC', '白血球'],
    Hb: ['Hb', 'Ｈｂ', 'ヘモグロビン'],
    Alb: ['Alb', 'ALB', 'アルブミン'],
  },
});
