import { ReactNode } from 'react';

export interface LearningStep {
  id: string;
  title: string;
  body: ReactNode;
  diagram?: ReactNode;
}

export interface LearningModule {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  steps: LearningStep[];
}
