#pragma once

#include <lvgl.h>
#include <stddef.h>

#include "compass_layout.h"

namespace roll_compass {

// LVGL retains the point array. Each line owns stable storage and invalidates
// only its old/new bounds, including LVGL's automatic stroke-width margin.
template <size_t Capacity>
class InstrumentLine {
public:
    bool update(lv_obj_t *object, const InstrumentPoint *points, size_t count) {
        if (object == nullptr || points == nullptr || count < 2 || count > Capacity) {
            return false;
        }
        int16_t left = points[0].x, right = left;
        int16_t top = points[0].y, bottom = top;
        for (size_t i = 1; i < count; ++i) {
            if (points[i].x < left) left = points[i].x;
            if (points[i].x > right) right = points[i].x;
            if (points[i].y < top) top = points[i].y;
            if (points[i].y > bottom) bottom = points[i].y;
        }
        bool changed = object != object_ || count != count_ || left != left_ || top != top_;
        for (size_t i = 0; i < count && !changed; ++i) {
            changed = local_[i].x != points[i].x - left ||
                local_[i].y != points[i].y - top;
        }
        if (!changed) return false;

        // Clear the previous stroke before mutating the retained point storage.
        lv_obj_invalidate(object);
        for (size_t i = 0; i < count; ++i) {
            local_[i] = lv_point_t{
                static_cast<lv_coord_t>(points[i].x - left),
                static_cast<lv_coord_t>(points[i].y - top),
            };
        }
        lv_obj_set_pos(object, left, top);
        lv_obj_set_size(object, right - left + 1, bottom - top + 1);
        lv_line_set_points(object, local_, static_cast<uint16_t>(count));
        object_ = object;
        left_ = left;
        top_ = top;
        count_ = count;
        return true;
    }

private:
    lv_point_t local_[Capacity] = {};
    lv_obj_t *object_ = nullptr;
    int16_t left_ = 0, top_ = 0;
    size_t count_ = 0;
};

}  // namespace roll_compass
