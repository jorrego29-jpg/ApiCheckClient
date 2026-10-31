import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HeaderList } from './header-list';
import { SentView } from './response-view';

/** La petición tal como salió: método, URL con las {{variables}} ya resueltas, params, headers y body. */
@Component({
  selector: 'app-sent-request',
  imports: [HeaderList],
  templateUrl: './sent-request.html',
  styleUrl: './sent-request.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SentRequest {
  readonly sent = input.required<SentView>();
}
