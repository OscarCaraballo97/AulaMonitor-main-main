import { Building } from './building.model';
import { ClassroomType } from './classroom-type.enum';

export interface Classroom {
  id?: string;
  name: string;
  capacity: number;
  type: ClassroomType;
  resources?: { [key: string]: number };
  isUnderMaintenance?: boolean;
  buildingId: string;
  building?: Building;
  buildingName?: string;
}

export interface ClassroomSummary {
  id: string;
  name: string;
  buildingName?: string;
  isUnderMaintenance?: boolean;
}
