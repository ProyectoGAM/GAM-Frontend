import { Component, input } from '@angular/core';
import { PlanActivity } from '../interfaces/management-plan';
import { activityTimingLabel, activityTypeLabel } from '../services/management-plan-format';

@Component({
  selector: 'app-plan-activities',
  template: `
    <ol class="activities">
      @for (activity of activities(); track activity.id; let index = $index) {
        @if (!currentOnly() || currentIds().has(activity.id)) {
        <li class="activity" [class.current]="currentIds().has(activity.id)">
          <span class="number">{{ (index + 1).toString().padStart(2, '0') }}</span>
          <div class="content">
            <div class="activity-top"><span class="kind">{{ typeLabel(activity.type) }}</span><span class="activity-tags">@if (currentIds().has(activity.id)) { <span class="current-tag">Prevista ahora</span> }@if (activity.conditional) { <span class="conditional">Condicional</span> }</span></div>
            <h3>{{ activity.title }}</h3>
            <p class="time">{{ timingLabel(activity) }}</p>
            @if (activity.type === 'ration_change') {
              @if (activity.catalog_snapshot?.['name']; as recipeName) { <p class="detail"><strong>Receta:</strong> {{ recipeName }}</p> }
              @if (activity.grams_per_bird; as grams) { <p class="detail"><strong>Cantidad por ave:</strong> {{ grams }} g/día</p> }
            }
            @if (activity.condition) { <p class="detail"><strong>Condición:</strong> {{ activity.condition }}</p> }
            @if (activity.notes) { <p class="detail">{{ activity.notes }}</p> }
          </div>
        </li>
        }
      }
    </ol>
  `,
  styleUrl: './plan-activities.component.scss',
})
export class PlanActivitiesComponent {
  readonly activities = input.required<PlanActivity[]>();
  readonly currentIds = input<ReadonlySet<string>>(new Set());
  readonly currentOnly = input(false);
  readonly typeLabel = activityTypeLabel;
  readonly timingLabel = activityTimingLabel;
}
