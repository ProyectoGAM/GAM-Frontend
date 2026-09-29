import { Component, input } from '@angular/core';
import { PlanActivity } from '../interfaces/management-plan';
import { activityTimingLabel, activityTypeLabel } from '../services/management-plan-format';

@Component({
  selector: 'app-plan-activities',
  template: `
    <ol class="activities">
      @for (activity of activities(); track activity.id; let index = $index) {
        <li class="activity">
          <span class="number">{{ (index + 1).toString().padStart(2, '0') }}</span>
          <div class="content">
            <div class="activity-top"><span class="kind">{{ typeLabel(activity.type) }}</span>@if (activity.conditional) { <span class="conditional">Condicional</span> }</div>
            <h3>{{ activity.title }}</h3>
            <p class="time">{{ timingLabel(activity) }}</p>
            @if (activity.condition) { <p class="detail"><strong>Condición:</strong> {{ activity.condition }}</p> }
            @if (activity.notes) { <p class="detail">{{ activity.notes }}</p> }
          </div>
        </li>
      }
    </ol>
  `,
  styleUrl: './plan-activities.component.scss',
})
export class PlanActivitiesComponent {
  readonly activities = input.required<PlanActivity[]>();
  readonly typeLabel = activityTypeLabel;
  readonly timingLabel = activityTimingLabel;
}
