import type { CreateGraduateRequest, Graduate, GraduatesResponse, UpdateGraduateRequest } from "@grad/contract";
import { GraduatesRepository } from "./graduates.repository.js";

export class GraduatesService {
  constructor(private readonly repository: GraduatesRepository = new GraduatesRepository()) {}

  async listGraduates(): Promise<GraduatesResponse> {
    return { items: await this.repository.list() };
  }

  /** Adds one graduate. Throws DuplicateGraduateError when the email is taken. */
  async createGraduate(dto: CreateGraduateRequest, actor: string): Promise<Graduate> {
    return this.repository.create(dto, actor);
  }

  /** Edits one graduate; null when unknown. Throws DuplicateGraduateError when the email is taken. */
  async updateGraduate(id: string, dto: UpdateGraduateRequest, actor: string): Promise<Graduate | null> {
    return this.repository.update(id, dto, actor);
  }
}
