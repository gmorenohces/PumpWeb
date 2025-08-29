import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenerateAdsComponent } from './generate-ads.component';

describe('GenerateAdsComponent', () => {
  let component: GenerateAdsComponent;
  let fixture: ComponentFixture<GenerateAdsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenerateAdsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenerateAdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
