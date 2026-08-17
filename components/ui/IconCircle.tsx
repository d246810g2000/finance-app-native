import React from 'react';
import { View, StyleSheet, type ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withContinuousRadius } from '../../theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface IconCircleProps {
    name: IoniconsName;
    color: ColorValue;
    backgroundColor?: ColorValue;
    size?: number;
    iconSize?: number;
}

export default function IconCircle({
    name,
    color,
    backgroundColor,
    size = 40,
    iconSize = 20,
}: IconCircleProps) {
    const radius = size / 2;

    return (
        <View
            style={[
                styles.circle,
                withContinuousRadius(radius),
                {
                    width: size,
                    height: size,
                    backgroundColor: backgroundColor ?? undefined,
                },
            ]}
        >
            <Ionicons name={name} size={iconSize} color={color} />
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
