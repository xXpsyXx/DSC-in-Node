import { Routes } from '@angular/router';
import { PdfSignerComponent } from './components/pdf-signer.component';
import { VerifySignatureComponent } from './components/verify-signature.component';

export const routes: Routes = [
  { path: '', component: PdfSignerComponent },
  { path: 'sign', component: PdfSignerComponent },
  { path: 'verify', component: VerifySignatureComponent },
  { path: '**', redirectTo: '' },
];
