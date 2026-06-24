import { TestBed } from '@angular/core/testing';

import { PdfServiceTsService } from './pdf.service';

describe('PdfServiceTsService', () => {
  let service: PdfServiceTsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfServiceTsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
