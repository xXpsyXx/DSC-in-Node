import { TestBed } from '@angular/core/testing';

import { Dsc } from './dsc';

describe('Dsc', () => {
  let service: Dsc;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Dsc);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
