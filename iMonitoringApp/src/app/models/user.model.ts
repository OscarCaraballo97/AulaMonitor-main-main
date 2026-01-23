import { Rol } from './rol.model';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Rol;
  career?: string;
  avatarUrl?: string;
  profilePicture?: string;
  imageType?: string;
  enabled: boolean;
}
